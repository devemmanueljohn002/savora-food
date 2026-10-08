import { randomBytes, randomUUID } from "crypto";
import { db } from "./db";
import { ApiError } from "./errors";
import { getPayoutSettings } from "./money";
import { roundMoney } from "./orders";

/**
 * Polymorphic payout wallet (vendors + riders, no duplicated service code).
 *
 * Owners are (owner_type, owner_id) pairs — vendors use vendors.id, riders
 * use delivery_partners.id. Ownership is enforced at the app layer
 * (requireVendor/getVendorContext, rider role/getRiderByUserId, plus
 * assertOwner() below) because one FK cannot point at two tables.
 *
 * Money is BIGINT kobo integers — never floats. Every balance mutation runs
 * inside a DB transaction that locks the wallet row with SELECT ... FOR
 * UPDATE. The webhook (transfer.success/failed/reversed) is the source of
 * truth for final withdrawal status for BOTH owner types.
 */

export type OwnerType = "VENDOR" | "RIDER" | "AFFILIATE";
export type Owner = { type: OwnerType; id: string };

export type EntryType =
  | "hold"
  | "release"
  | "withdrawal"
  | "withdrawal_reversal"
  | "adjustment"
  | "delivery_fee"
  | "tip"
  | "bonus"
  | "penalty";

export type WithdrawalStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "REVERSED" | "OTP";

// ── Pure policy (unit-testable, no DB) ─────────────────────────────────────

export type OwnerPolicy = {
  holdDays: number;
  minWithdrawalKobo: number;
  maxWithdrawalKobo: number;
  autoApproveBelowKobo: number;
};

/** Vendor defaults (also the fallback for any missing per-type config). */
export const WITHDRAWAL_LIMITS = {
  /** Earnings unlock this many days after delivery (hold absorbs refunds/chargebacks). */
  holdDays: 2,
  /** Minimum single withdrawal: ₦10,000 in kobo. Rejects dust/test spam. */
  minWithdrawalKobo: 1_000_000,
  /** Maximum single withdrawal: ₦500,000 in kobo. Caps blast radius of a compromised session. */
  maxWithdrawalKobo: 50_000_000,
  /** At or below ₦50,000: execute immediately. Above: park as PENDING for admin approval. */
  autoApproveBelowKobo: 5_000_000,
} as const;

export const RIDER_POLICY_FALLBACK: OwnerPolicy = {
  holdDays: 1,
  minWithdrawalKobo: 500_000,
  maxWithdrawalKobo: 50_000_000,
  autoApproveBelowKobo: 5_000_000,
};

/** Affiliate fallback: ₦3,000 minimum, no hold (commission is already gated on delivery). */
export const AFFILIATE_POLICY_FALLBACK: OwnerPolicy = {
  holdDays: 0,
  minWithdrawalKobo: 300_000,
  maxWithdrawalKobo: 50_000_000,
  autoApproveBelowKobo: 5_000_000,
};

/** Daily withdrawal counts (CONFIGURABLE per role via payout_config). */
export const VENDOR_DAILY_LIMIT_FALLBACK = 2;
export const RIDER_DAILY_LIMIT_FALLBACK = 3;
export const AFFILIATE_DAILY_LIMIT_FALLBACK = 2;

/** Paystack transfer fee snapshot (CONFIGURABLE). Default ₦100 = 10,000 kobo. */
export const TRANSFER_FEE_KOBO_FALLBACK = 10_000;

export type TransferFeeBearer = "USER" | "SAVORA";
export const TRANSFER_FEE_BEARER_FALLBACK: TransferFeeBearer = "USER";

export type PayoutApprovalMode = "AUTO" | "MANUAL";
export const PAYOUT_APPROVAL_MODE_FALLBACK: PayoutApprovalMode = "AUTO";

/** Per-owner transfer reason sent to Paystack (clear payout label). */
export function transferReasonFor(ownerType: OwnerType): string {
  if (ownerType === "RIDER") return "Savora Food Rider Payout";
  if (ownerType === "AFFILIATE") return "Savora Food Affiliate Payout";
  return "Savora Food Vendor Payout";
}

/** Hours after a payout-account change during which withdrawals are blocked. */
export const BANK_CHANGE_COOLING_HOURS_FALLBACK = 24;

/** Share of the rider fee credited when a delivery is cancelled after pickup.
 *  ASSUMPTION (flagged in final report): no prior rule existed. */
export const CANCELLED_PICKUP_FEE_PCT_FALLBACK = 50;

const TERMINAL_STATUSES: ReadonlySet<WithdrawalStatus> = new Set(["SUCCESS", "FAILED", "REVERSED"]);

/** Terminal states are final — a replayed webhook for one of these is a no-op. */
export function isTerminalWithdrawalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status as WithdrawalStatus);
}

/** Naira float → kobo int. Central choke point so floats never reach the DB. */
export function nairaToKobo(naira: number): number {
  if (!Number.isFinite(naira) || naira < 0) {
    throw ApiError.validation("Invalid amount.");
  }
  return Math.round(naira * 100);
}

export function koboToNaira(kobo: number): number {
  return Math.round(kobo) / 100;
}

/**
 * Rider fee in kobo for an order delivery fee (naira) and share percent.
 * Formula is IDENTICAL to money.ts computeMoneySplit (round to kobo via the
 * same 2dp rounding) — this helper only freezes the unit conversion so the
 * stored value never depends on later rate/config changes.
 */
export function computeRiderFeeKobo(deliveryFeeNaira: number, sharePct: number): number {
  const pct = Math.min(Math.max(0, sharePct), 100);
  return nairaToKobo(roundMoney((deliveryFeeNaira * pct) / 100));
}

export function validateWithdrawalAmount(amountKobo: number, availableKobo: number, policy?: OwnerPolicy): void {
  const limits = policy ?? WITHDRAWAL_LIMITS;
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    throw ApiError.validation("Enter a valid withdrawal amount.");
  }
  if (amountKobo < limits.minWithdrawalKobo) {
    throw ApiError.validation(
      `Minimum withdrawal is ₦${koboToNaira(limits.minWithdrawalKobo).toLocaleString()}.`,
    );
  }
  if (amountKobo > limits.maxWithdrawalKobo) {
    throw ApiError.validation(
      `Maximum withdrawal is ₦${koboToNaira(limits.maxWithdrawalKobo).toLocaleString()}. Contact support for larger payouts.`,
    );
  }
  // A penalty-driven negative balance fails here for ANY amount, which is
  // exactly the "withdrawals blocked until positive again" rule.
  if (isWithdrawalBlockedByBalance(availableKobo, amountKobo)) {
    throw ApiError.conflict("Insufficient available balance for this withdrawal.");
  }
}

/** Postgres unique-violation code — used to turn double-clicks/double-credits into safe no-ops. */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

/** transfer.failed / transfer.reversed must restore the owner's balance. */
export function shouldReverseForEvent(event: string): boolean {
  return event === "transfer.failed" || event === "transfer.reversed";
}

/**
 * Pure webhook transition: given the stored status and the incoming event,
 * returns the next status, or null when the event must NOT change anything
 * (terminal state already reached → replayed delivery, or unknown event).
 * Owner-agnostic: identical for vendors and riders.
 */
export function nextWithdrawalStatus(current: string, event: string): WithdrawalStatus | null {
  if (isTerminalWithdrawalStatus(current)) return null;
  switch (event) {
    case "transfer.success":
      return "SUCCESS";
    case "transfer.failed":
      return "FAILED";
    case "transfer.reversed":
      return "REVERSED";
    case "transfer.pending":
      return current === "PENDING" ? "PROCESSING" : null;
    case "transfer.otp":
      return "OTP";
    default:
      return null;
  }
}

/** Cross-owner guard: a rider can never touch a vendor row and vice versa. */
export function ownerMatches(
  row: { owner_type: string; owner_id: string },
  owner: Owner,
): boolean {
  return row.owner_type === owner.type && row.owner_id === owner.id;
}

export function assertOwner(row: { owner_type: string; owner_id: string }, owner: Owner): void {
  if (!ownerMatches(row, owner)) {
    throw ApiError.forbidden("You do not have access to this wallet.");
  }
}

/** Pure cooling check: withdrawals blocked for coolingHours after a bank change. */
export function isCoolingActive(changedAt: Date | string | null, coolingHours: number): boolean {
  if (!changedAt) return false;
  const changed = new Date(changedAt).getTime();
  if (!Number.isFinite(changed)) return false;
  return Date.now() - changed < coolingHours * 3_600_000;
}

/**
 * Pure partial-fee math for a delivery cancelled AFTER pickup. Before pickup
 * the caller passes nothing — cancelled-before-pickup earns zero.
 */
export function computeCancelledPickupFeeKobo(fullFeeKobo: number, pct: number): number {
  if (!Number.isInteger(fullFeeKobo) || fullFeeKobo <= 0) return 0;
  const bounded = Math.min(Math.max(0, pct), 100);
  return Math.round((fullFeeKobo * bounded) / 100);
}

/**
 * Pure withdrawal gate for the negative-balance rule: a penalty can push a
 * wallet below zero, and no withdrawal of ANY size is allowed until the
 * available balance is positive again.
 */
export function isWithdrawalBlockedByBalance(availableKobo: number, amountKobo: number): boolean {
  return !Number.isInteger(amountKobo) || amountKobo <= 0 || amountKobo > availableKobo;
}

/** Pure delivery-confirmation gate: credits require a confirmed handover. */
export function requireDeliveryConfirmed(confirmed: boolean): void {
  if (!confirmed) {
    throw ApiError.conflict("Delivery must be confirmed before earnings are credited.");
  }
}

export function generateWithdrawalReference(): string {
  return `SV-WD-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export function generateIdempotencyKey(): string {
  return randomUUID();
}

// ── Config readers ──────────────────────────────────────────────────────────

async function payoutSettings(): Promise<Record<string, unknown>> {
  try {
    return await getPayoutSettings();
  } catch {
    return {};
  }
}

function numSetting(settings: Record<string, unknown>, key: string, fallback: number): number {
  const raw = settings[key];
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

/**
 * Pure per-owner-type policy resolution — the single place vendor vs rider
 * limits are decided. Exported (and DB-free) so the rules are unit-testable.
 */
export function resolveOwnerPolicy(
  ownerType: OwnerType,
  settings: Record<string, unknown>,
): OwnerPolicy {
  if (ownerType === "RIDER") {
    return {
      holdDays: numSetting(settings, "rider_hold_days", RIDER_POLICY_FALLBACK.holdDays),
      minWithdrawalKobo: Math.round(
        numSetting(settings, "rider_min_withdrawal_kobo", RIDER_POLICY_FALLBACK.minWithdrawalKobo),
      ),
      maxWithdrawalKobo: Math.round(
        numSetting(settings, "rider_max_withdrawal_kobo", RIDER_POLICY_FALLBACK.maxWithdrawalKobo),
      ),
      autoApproveBelowKobo: Math.round(
        numSetting(settings, "rider_auto_approve_below_kobo", RIDER_POLICY_FALLBACK.autoApproveBelowKobo),
      ),
    };
  }
  if (ownerType === "AFFILIATE") {
    return {
      holdDays: numSetting(settings, "affiliate_hold_days", AFFILIATE_POLICY_FALLBACK.holdDays),
      minWithdrawalKobo: Math.round(
        numSetting(settings, "affiliate_min_withdrawal_kobo", AFFILIATE_POLICY_FALLBACK.minWithdrawalKobo),
      ),
      maxWithdrawalKobo: Math.round(
        numSetting(settings, "affiliate_max_withdrawal_kobo", AFFILIATE_POLICY_FALLBACK.maxWithdrawalKobo),
      ),
      autoApproveBelowKobo: Math.round(
        numSetting(settings, "affiliate_auto_approve_below_kobo", AFFILIATE_POLICY_FALLBACK.autoApproveBelowKobo),
      ),
    };
  }
  return {
    holdDays: numSetting(settings, "hold_days", WITHDRAWAL_LIMITS.holdDays),
    minWithdrawalKobo: Math.round(numSetting(settings, "min_withdrawal_kobo", WITHDRAWAL_LIMITS.minWithdrawalKobo)),
    maxWithdrawalKobo: Math.round(numSetting(settings, "max_withdrawal_kobo", WITHDRAWAL_LIMITS.maxWithdrawalKobo)),
    autoApproveBelowKobo: Math.round(
      numSetting(settings, "auto_approve_below_kobo", WITHDRAWAL_LIMITS.autoApproveBelowKobo),
    ),
  };
}

export async function getOwnerPolicy(ownerType: OwnerType): Promise<OwnerPolicy> {
  return resolveOwnerPolicy(ownerType, await payoutSettings());
}

export function resolveCoolingHours(settings: Record<string, unknown>): number {
  const raw = numSetting(settings, "bank_change_cooling_hours", BANK_CHANGE_COOLING_HOURS_FALLBACK);
  return Math.max(1, Math.round(raw));
}

export async function getCoolingHours(): Promise<number> {
  return resolveCoolingHours(await payoutSettings());
}

export function resolveCancelledPickupFeePct(settings: Record<string, unknown>): number {
  return Math.min(100, numSetting(settings, "cancelled_pickup_fee_pct", CANCELLED_PICKUP_FEE_PCT_FALLBACK));
}

export async function getCancelledPickupFeePct(): Promise<number> {
  return resolveCancelledPickupFeePct(await payoutSettings());
}

export function resolveRiderSharePct(settings: Record<string, unknown>): number {
  const raw = settings["rider_share_of_delivery_fee_pct"];
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.min(Math.max(0, raw), 100);
  return 100;
}

export async function getRiderSharePct(): Promise<number> {
  return resolveRiderSharePct(await payoutSettings());
}

/** Daily withdrawal limit for an owner type (CONFIGURABLE per role). */
export function resolveDailyLimit(ownerType: OwnerType, settings: Record<string, unknown>): number {
  if (ownerType === "RIDER") {
    return Math.max(1, Math.round(numSetting(settings, "rider_daily_withdrawal_limit", RIDER_DAILY_LIMIT_FALLBACK)));
  }
  if (ownerType === "AFFILIATE") {
    return Math.max(1, Math.round(numSetting(settings, "affiliate_daily_withdrawal_limit", AFFILIATE_DAILY_LIMIT_FALLBACK)));
  }
  return Math.max(1, Math.round(numSetting(settings, "vendor_daily_withdrawal_limit", VENDOR_DAILY_LIMIT_FALLBACK)));
}

export async function getDailyLimit(ownerType: OwnerType): Promise<number> {
  return resolveDailyLimit(ownerType, await payoutSettings());
}

/** Flat Paystack transfer fee in kobo (CONFIGURABLE). */
export function resolveTransferFeeKobo(settings: Record<string, unknown>): number {
  return Math.max(0, Math.round(numSetting(settings, "transfer_fee_kobo", TRANSFER_FEE_KOBO_FALLBACK)));
}

export async function getTransferFeeKobo(): Promise<number> {
  return resolveTransferFeeKobo(await payoutSettings());
}

/** Who absorbs the transfer fee (CONFIGURABLE): USER = deducted from payout, SAVORA = platform absorbs. */
export function resolveFeeBearer(settings: Record<string, unknown>): TransferFeeBearer {
  return settings["transfer_fee_bearer"] === "SAVORA" ? "SAVORA" : "USER";
}

export async function getFeeBearer(): Promise<TransferFeeBearer> {
  return resolveFeeBearer(await payoutSettings());
}

/** Auto-approve vs manual-approve toggle (CONFIGURABLE). MANUAL parks every request for admin review. */
export function resolveApprovalMode(settings: Record<string, unknown>): PayoutApprovalMode {
  return settings["payout_approval_mode"] === "MANUAL" ? "MANUAL" : "AUTO";
}

export async function getApprovalMode(): Promise<PayoutApprovalMode> {
  return resolveApprovalMode(await payoutSettings());
}

/**
 * Pure fee math: what the recipient actually receives.
 * USER bearer → amount minus fee (floored at 0); SAVORA bearer → full amount.
 */
export function computeNetKobo(amountKobo: number, feeKobo: number, bearer: TransferFeeBearer): number {
  if (bearer === "SAVORA") return amountKobo;
  return Math.max(0, amountKobo - feeKobo);
}

/** Pure daily-limit gate (unit-testable). */
export function isDailyLimitReached(todayCount: number, limit: number): boolean {
  return todayCount >= limit;
}

// ── DB-backed wallet operations ─────────────────────────────────────────────

export type Wallet = {
  owner_type: string;
  owner_id: string;
  available_kobo: string | number;
  pending_kobo: string | number;
};

export type WithdrawalRow = {
  id: string;
  owner_type: OwnerType;
  owner_id: string;
  amount_kobo: string | number;
  recipient_code: string;
  bank_code: string | null;
  account_number: string | null;
  account_name: string | null;
  reference: string;
  paystack_transfer_code: string | null;
  status: WithdrawalStatus;
  failure_reason: string | null;
  idempotency_key: string;
  approved_by: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
  fee_kobo?: string | number | null;
  net_kobo?: string | number | null;
  fee_bearer?: string | null;
};

import type { TransactionSql } from "postgres";

/** Transaction handle passed by postgres.js into sql.begin(). */
export type Tx = TransactionSql;

function toInt(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

async function ensureWalletTx(tx: Tx, owner: Owner): Promise<void> {
  await tx`
    INSERT INTO wallets (owner_type, owner_id, available_kobo, pending_kobo)
    VALUES (${owner.type}, ${owner.id}, 0, 0)
    ON CONFLICT (owner_type, owner_id) DO NOTHING
  `;
}

async function lockWalletTx(tx: Tx, owner: Owner): Promise<{ available: number; pending: number }> {
  const wallets = await tx<Wallet[]>`
    SELECT owner_type, owner_id, available_kobo, pending_kobo FROM wallets
    WHERE owner_type = ${owner.type} AND owner_id = ${owner.id} FOR UPDATE
  `;
  const wallet = wallets[0];
  if (!wallet) throw ApiError.internal();
  return { available: toInt(wallet.available_kobo), pending: toInt(wallet.pending_kobo) };
}

/**
 * Credit a vendor's PENDING wallet when an order is DELIVERED. Idempotent:
 * the partial unique index on (order_id, 'hold') makes a second call a
 * no-op. Best-effort — callers must never fail delivery on ledger errors.
 */
export async function creditVendorForOrder(orderId: string): Promise<boolean> {
  const sql = db();
  const settlements = await sql<{
    vendor_id: string;
    vendor_net: string;
  }[]>`
    SELECT vendor_id, vendor_net::text AS vendor_net
    FROM order_settlements
    WHERE order_id = ${orderId} AND status = 'PAYABLE'
    LIMIT 1
  `;
  const settlement = settlements[0];
  if (!settlement) return false;
  const amountKobo = Math.round(Number(settlement.vendor_net) * 100);
  if (!Number.isFinite(amountKobo) || amountKobo <= 0) return false;
  const owner: Owner = { type: "VENDOR", id: settlement.vendor_id };

  try {
    const credited = await sql.begin(async (tx) => {
      await ensureWalletTx(tx, owner);
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO wallet_entries
          (owner_type, owner_id, kind, amount_kobo, balance_after_kobo, order_id, meta)
        VALUES (
          ${owner.type}, ${owner.id}, 'hold', ${amountKobo},
          (SELECT pending_kobo + ${amountKobo} FROM wallets
           WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}),
          ${orderId},
          ${tx.json({ vendorNetNaira: Number(settlement.vendor_net) })}
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      if (inserted.length === 0) return false;
      await tx`
        UPDATE wallets SET pending_kobo = pending_kobo + ${amountKobo}, updated_at = NOW()
        WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
      `;
      return true;
    });
    return credited;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/**
 * Credit a rider's delivery fee. MUST be called inside the same DB
 * transaction that marks the delivery completed, and ONLY after delivery
 * confirmation (OTP/PIN verified by the caller — enforced via `confirmed`).
 * The fee is computed once, stored on deliveries.rider_fee_kobo
 * (COALESCE keeps the first value forever — later rate changes cannot alter
 * it), and exactly one delivery_fee entry exists per delivery (unique
 * index + ON CONFLICT DO NOTHING), so double completion credits once.
 */
export async function creditRiderDeliveryTx(
  tx: Tx,
  input: { deliveryId: string; riderId: string; orderId: string; confirmed: boolean },
): Promise<{ feeKobo: number; credited: boolean }> {
  requireDeliveryConfirmed(input.confirmed);
  const owner: Owner = { type: "RIDER", id: input.riderId };

  const orders = await tx<{ delivery_fee: string; payout_bonus: string | null }[]>`
    SELECT delivery_fee::text AS delivery_fee, COALESCE(payout_bonus, 0)::text AS payout_bonus FROM orders WHERE id = ${input.orderId} LIMIT 1
  `;
  if (!orders[0]) throw ApiError.notFound("Order not found.");
  const feeKobo = computeRiderFeeKobo(Number(orders[0].delivery_fee), await getRiderSharePct());
  // Platform-funded escalation bonus (board model): added once, frozen with the fee.
  const bonusKobo = Math.max(0, Math.round(Number(orders[0].payout_bonus ?? 0) * 100));
  const totalKobo = feeKobo + bonusKobo;

  await ensureWalletTx(tx, owner);
  // Freeze the fee on first completion; never recalculate afterwards.
  await tx`
    UPDATE deliveries SET rider_fee_kobo = COALESCE(rider_fee_kobo, ${totalKobo})
    WHERE id = ${input.deliveryId}
  `;
  const stored = await tx<{ rider_fee_kobo: string }[]>`
    SELECT rider_fee_kobo::text AS rider_fee_kobo FROM deliveries WHERE id = ${input.deliveryId} LIMIT 1
  `;
  const frozenKobo = Number(stored[0]?.rider_fee_kobo ?? totalKobo);

  let credited = false;
  if (frozenKobo > 0) {
    const inserted = await tx<{ id: string }[]>`
      INSERT INTO wallet_entries
        (owner_type, owner_id, kind, amount_kobo, balance_after_kobo, delivery_id, order_id, meta)
      VALUES (
        ${owner.type}, ${owner.id}, 'delivery_fee', ${frozenKobo},
        (SELECT pending_kobo + ${frozenKobo} FROM wallets
         WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}),
        ${input.deliveryId}, ${input.orderId},
        ${tx.json({ frozenAtCompletion: true })}
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (inserted.length > 0) {
      await tx`
        UPDATE wallets SET pending_kobo = pending_kobo + ${frozenKobo}, updated_at = NOW()
        WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
      `;
      credited = true;
    }
  }
  return { feeKobo: frozenKobo, credited };
}

/**
 * Partial fee for a delivery cancelled AFTER pickup (configurable
 * cancelled_pickup_fee_pct of the frozen/computed fee). Cancelled before
 * pickup credits nothing — callers pass pickedUp from the pre-update status.
 * Same idempotency guarantee as delivery_fee (shared unique index).
 */
export async function creditCancelledPickupFeeTx(
  tx: Tx,
  input: { deliveryId: string; riderId: string; orderId: string; pickedUp: boolean },
): Promise<{ feeKobo: number; credited: boolean }> {
  if (!input.pickedUp) return { feeKobo: 0, credited: false };
  const owner: Owner = { type: "RIDER", id: input.riderId };

  const orders = await tx<{ delivery_fee: string }[]>`
    SELECT delivery_fee::text AS delivery_fee FROM orders WHERE id = ${input.orderId} LIMIT 1
  `;
  if (!orders[0]) return { feeKobo: 0, credited: false };
  const fullKobo = computeRiderFeeKobo(Number(orders[0].delivery_fee), await getRiderSharePct());
  const pct = await getCancelledPickupFeePct();
  const feeKobo = computeCancelledPickupFeeKobo(fullKobo, pct);
  if (feeKobo <= 0) return { feeKobo: 0, credited: false };

  await ensureWalletTx(tx, owner);
  await tx`
    UPDATE deliveries SET rider_fee_kobo = COALESCE(rider_fee_kobo, ${feeKobo})
    WHERE id = ${input.deliveryId}
  `;
  const stored = await tx<{ rider_fee_kobo: string }[]>`
    SELECT rider_fee_kobo::text AS rider_fee_kobo FROM deliveries WHERE id = ${input.deliveryId} LIMIT 1
  `;
  const frozenKobo = Number(stored[0]?.rider_fee_kobo ?? feeKobo);

  const inserted = await tx<{ id: string }[]>`
    INSERT INTO wallet_entries
      (owner_type, owner_id, kind, amount_kobo, balance_after_kobo, delivery_id, order_id, meta)
    VALUES (
      ${owner.type}, ${owner.id}, 'delivery_fee', ${frozenKobo},
      (SELECT pending_kobo + ${frozenKobo} FROM wallets
       WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}),
      ${input.deliveryId}, ${input.orderId},
      ${tx.json({ cancelledAfterPickup: true, pct })}
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  if (inserted.length === 0) return { feeKobo: frozenKobo, credited: false };
  await tx`
    UPDATE wallets SET pending_kobo = pending_kobo + ${frozenKobo}, updated_at = NOW()
    WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
  `;
  return { feeKobo: frozenKobo, credited: true };
}

/** One tip per delivery (unique index) — a retried tip callback cannot double-pay. */
/**
 * Administrative bonus (positive) or penalty (negative) applied to AVAILABLE
 * immediately — these are finance decisions, not delivery earnings, so no
 * hold applies. A penalty may push available below zero; withdrawals stay
 * blocked until it is positive again (see validateWithdrawalAmount).
 */
export async function applyAdjustment(input: {
  owner: Owner;
  kind: Extract<EntryType, "bonus" | "penalty" | "adjustment">;
  amountKobo: number;
  reason?: string | null;
  deliveryId?: string | null;
  orderId?: string | null;
  adminId?: string | null;
}): Promise<void> {
  if (!Number.isInteger(input.amountKobo) || input.amountKobo === 0) {
    throw ApiError.validation("Invalid adjustment amount.");
  }
  if (input.kind === "bonus" && input.amountKobo < 0) {
    throw ApiError.validation("Bonus must be positive. Use penalty for deductions.");
  }
  if (input.kind === "penalty" && input.amountKobo > 0) {
    throw ApiError.validation("Penalty must be negative. Use bonus for additions.");
  }
  const sql = db();
  await sql.begin(async (tx) => {
    await ensureWalletTx(tx, input.owner);
    const { available } = await lockWalletTx(tx, input.owner);
    const next = available + input.amountKobo;
    await tx`
      UPDATE wallets SET available_kobo = ${next}, updated_at = NOW()
      WHERE owner_type = ${input.owner.type} AND owner_id = ${input.owner.id}
    `;
    await tx`
      INSERT INTO wallet_entries
        (owner_type, owner_id, kind, amount_kobo, balance_after_kobo, delivery_id, order_id, meta)
      VALUES (
        ${input.owner.type}, ${input.owner.id}, ${input.kind}, ${input.amountKobo}, ${next},
        ${input.deliveryId ?? null}, ${input.orderId ?? null},
        ${tx.json({ reason: input.reason ?? null, adminId: input.adminId ?? null })}
      )
    `;
  });
}

/**
 * Affiliate holds mature when the order is DELIVERED (the commission only
 * exists for delivered, non-cancelled orders) plus an optional
 * affiliate_hold_days grace period (default 0 = releasable on the first
 * balance read after delivery). One release per order (idempotent).
 */
export async function releaseAffiliateHolds(owner: Owner, holdDays: number): Promise<number> {
  const sql = db();
  const days = Math.max(0, Math.round(holdDays));
  let released = 0;
  await sql.begin(async (tx) => {
    const balances = await lockWalletTx(tx, owner);
    // Matured-set selection runs INSIDE the tx after the wallet row lock is
    // held, so concurrent releasers serialize here instead of both passing
    // the NOT EXISTS check outside. Belt and suspenders with the partial
    // unique index on release rows (migration 025): the INSERT below returns
    // zero rows for a loser, and balances mutate only on a returned row.
    const matured = await tx<{ entry_id: string; amount_kobo: string; order_id: string }[]>`
      SELECT h.id AS entry_id, h.amount_kobo::text AS amount_kobo, h.order_id::text AS order_id
      FROM wallet_entries h
      JOIN orders o ON o.id = h.order_id
      LEFT JOIN deliveries d ON d.order_id = h.order_id
      WHERE h.owner_type = 'AFFILIATE' AND h.owner_id = ${owner.id}
        AND h.kind = 'hold'
        AND o.status = 'DELIVERED'
        AND (
          ${days} = 0
          OR COALESCE(d.delivered_at, o.updated_at) < NOW() - make_interval(days => ${days})
        )
        AND NOT EXISTS (
          SELECT 1 FROM wallet_entries r
          WHERE r.owner_type = 'AFFILIATE' AND r.owner_id = ${owner.id}
            AND r.kind = 'release' AND r.order_id = h.order_id
        )
    `;
    if (matured.length === 0) return;
    let available = balances.available;
    let pending = balances.pending;
    for (const row of matured) {
      const amountKobo = toInt(row.amount_kobo);
      if (amountKobo <= 0) continue;
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO wallet_entries
          (owner_type, owner_id, kind, amount_kobo, balance_after_kobo, order_id, meta)
        VALUES (
          ${owner.type}, ${owner.id}, 'release', ${amountKobo}, ${available + amountKobo}, ${row.order_id},
          ${tx.json({ releasedAfterDays: days })}
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      if (inserted.length === 0) continue;
      pending = Math.max(0, pending - amountKobo);
      available += amountKobo;
      released += amountKobo;
      await tx`
        UPDATE affiliate_commissions
        SET status = 'RELEASED', released_at = COALESCE(released_at, NOW())
        WHERE order_id = ${row.order_id} AND affiliate_id = ${owner.id} AND status = 'PENDING'
      `;
    }
    await tx`
      UPDATE wallets
      SET available_kobo = ${available}, pending_kobo = ${pending}, updated_at = NOW()
      WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
    `;
  });
  return released;
}

/**
 * Move matured holds into available balance. Vendors mature on
 * order_settlements age; riders mature on delivery_fee entry age (same
 * hold semantics, no settlement dependency); affiliates mature when the
 * order is DELIVERED (commission is only ever credited for delivered
 * orders, plus an optional affiliate_hold_days grace period). Safe to call
 * on read paths.
 */
export async function releaseDueHolds(owner: Owner, holdDays?: number): Promise<number> {
  const sql = db();
  const policy = await getOwnerPolicy(owner.type);
  const days = holdDays ?? policy.holdDays;

  if (owner.type === "AFFILIATE") {
    return releaseAffiliateHolds(owner, Math.max(0, days));
  }
  if (days <= 0) return 0;

  if (owner.type === "VENDOR") {
    const matured = await sql<{ order_id: string; vendor_net: string }[]>`
      SELECT s.order_id, s.vendor_net::text AS vendor_net
      FROM order_settlements s
      WHERE s.vendor_id = ${owner.id}
        AND s.status = 'PAYABLE'
        AND s.created_at < NOW() - make_interval(days => ${days})
        AND EXISTS (
          SELECT 1 FROM wallet_entries h
          WHERE h.owner_type = 'VENDOR' AND h.order_id = s.order_id AND h.kind = 'hold'
        )
        AND NOT EXISTS (
          SELECT 1 FROM wallet_entries r
          WHERE r.owner_type = 'VENDOR' AND r.order_id = s.order_id AND r.kind = 'release'
        )
    `;
    if (matured.length === 0) return 0;
    let released = 0;
    await sql.begin(async (tx) => {
      const balances = await lockWalletTx(tx, owner);
      let available = balances.available;
      let pending = balances.pending;
      for (const row of matured) {
        const amountKobo = Math.round(Number(row.vendor_net) * 100);
        if (!Number.isFinite(amountKobo) || amountKobo <= 0) continue;
        pending = Math.max(0, pending - amountKobo);
        available += amountKobo;
        released += amountKobo;
        await tx`
          INSERT INTO wallet_entries
            (owner_type, owner_id, kind, amount_kobo, balance_after_kobo, order_id, meta)
          VALUES (
            ${owner.type}, ${owner.id}, 'release', ${amountKobo}, ${available}, ${row.order_id},
            ${tx.json({ releasedAfterDays: days })}
          )
          ON CONFLICT DO NOTHING
        `;
      }
      await tx`
        UPDATE wallets
        SET available_kobo = ${available}, pending_kobo = ${pending}, updated_at = NOW()
        WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
      `;
    });
    return released;
  }

  const matured = await sql<{ entry_id: string; amount_kobo: string }[]>`
    SELECT id AS entry_id, amount_kobo::text AS amount_kobo
    FROM wallet_entries
    WHERE owner_type = 'RIDER' AND owner_id = ${owner.id}
      AND kind = 'delivery_fee'
      AND created_at < NOW() - make_interval(days => ${days})
      AND NOT EXISTS (
        SELECT 1 FROM wallet_entries r
        WHERE r.owner_type = 'RIDER' AND r.owner_id = ${owner.id}
          AND r.kind = 'release' AND r.delivery_id = wallet_entries.delivery_id
      )
  `;
  if (matured.length === 0) return 0;
  let released = 0;
  await sql.begin(async (tx) => {
    const balances = await lockWalletTx(tx, owner);
    let available = balances.available;
    let pending = balances.pending;
    for (const row of matured) {
      const amountKobo = toInt(row.amount_kobo);
      if (amountKobo <= 0) continue;
      const deliveries = await tx<{ delivery_id: string }[]>`
        SELECT delivery_id::text AS delivery_id FROM wallet_entries WHERE id = ${row.entry_id} LIMIT 1
      `;
      pending = Math.max(0, pending - amountKobo);
      available += amountKobo;
      released += amountKobo;
      await tx`
        INSERT INTO wallet_entries
          (owner_type, owner_id, kind, amount_kobo, balance_after_kobo, delivery_id, meta)
        VALUES (
          ${owner.type}, ${owner.id}, 'release', ${amountKobo}, ${available},
          ${deliveries[0]?.delivery_id ?? null},
          ${tx.json({ releasedAfterDays: days })}
        )
      `;
    }
    await tx`
      UPDATE wallets
      SET available_kobo = ${available}, pending_kobo = ${pending}, updated_at = NOW()
      WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
    `;
  });
  return released;
}

export async function getWalletBalance(owner: Owner): Promise<{ availableKobo: number; pendingKobo: number }> {
  await releaseDueHolds(owner).catch(() => undefined);
  const rows = await db()<Wallet[]>`
    SELECT owner_type, owner_id, available_kobo, pending_kobo FROM wallets
    WHERE owner_type = ${owner.type} AND owner_id = ${owner.id} LIMIT 1
  `;
  return {
    availableKobo: toInt(rows[0]?.available_kobo),
    pendingKobo: toInt(rows[0]?.pending_kobo),
  };
}

/** Backwards-compatible vendor wrapper (existing call sites pass a vendor id). */
export async function getWallet(vendorId: string): Promise<{ availableKobo: number; pendingKobo: number }> {
  return getWalletBalance({ type: "VENDOR", id: vendorId });
}

async function payoutAccountChangedAt(owner: Owner): Promise<Date | null> {
  const sql = db();
  if (owner.type === "VENDOR") {
    const rows = await sql<{ payout_account_changed_at: Date | null }[]>`
      SELECT payout_account_changed_at FROM vendors WHERE id = ${owner.id} LIMIT 1
    `;
    return rows[0]?.payout_account_changed_at ?? null;
  }
  if (owner.type === "AFFILIATE") {
    const rows = await sql<{ payout_account_changed_at: Date | null }[]>`
      SELECT payout_account_changed_at FROM affiliates WHERE id = ${owner.id} LIMIT 1
    `;
    return rows[0]?.payout_account_changed_at ?? null;
  }
  const rows = await sql<{ payout_account_changed_at: Date | null }[]>`
    SELECT payout_account_changed_at FROM delivery_partners WHERE id = ${owner.id} LIMIT 1
  `;
  return rows[0]?.payout_account_changed_at ?? null;
}

export type RequestWithdrawalInput = {
  owner: Owner;
  amountKobo: number;
  recipientCode: string;
  bankCode?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  idempotencyKey?: string | null;
  feeKobo?: number | null;
  netKobo?: number | null;
  feeBearer?: TransferFeeBearer | null;
};

/** How many withdrawals this owner created since midnight (server time). */
export async function countTodayWithdrawals(owner: Owner): Promise<number> {
  const rows = await db()<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM withdrawals
    WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
      AND created_at >= date_trunc('day', NOW())
  `;
  return Number(rows[0]?.count ?? 0);
}

/**
 * Best-effort pre-validation before an OTP is consumed: cooling window,
 * daily limit, and balance sufficiency. Read-only (no mutation, no lock),
 * so the locked transaction inside requestWithdrawal stays authoritative —
 * this only spares users from burning a single-use code on a request that
 * is already doomed. Keep in sync with the in-transaction checks.
 */
export async function precheckWithdrawal(input: { owner: Owner; amountKobo: number }): Promise<void> {
  const policy = await getOwnerPolicy(input.owner.type);
  const coolingHours = await getCoolingHours();
  const changedAt = await payoutAccountChangedAt(input.owner);
  if (isCoolingActive(changedAt, coolingHours)) {
    throw ApiError.conflict(
      `For your protection, withdrawals are paused for ${coolingHours} hours after a bank account change. Try again later or contact support.`,
    );
  }
  const dailyLimit = await getDailyLimit(input.owner.type);
  const todayCount = await countTodayWithdrawals(input.owner);
  if (isDailyLimitReached(todayCount, dailyLimit)) {
    throw ApiError.conflict(
      `Daily withdrawal limit reached (${dailyLimit} per day). Try again tomorrow.`,
    );
  }
  const balances = await getWalletBalance(input.owner);
  validateWithdrawalAmount(input.amountKobo, balances.availableKobo, policy);
}

/**
 * Deduct-then-call, for EITHER owner type: in ONE transaction, lock the
 * wallet, enforce cooling + policy limits, check the balance, deduct, and
 * create the withdrawal as PENDING with its server-side reference. The
 * Paystack call happens only AFTER commit. A duplicate idempotency_key
 * returns the existing row (double-click safe), cross-owner reuse rejected.
 */
export async function requestWithdrawal(input: RequestWithdrawalInput): Promise<{
  withdrawal: WithdrawalRow;
  duplicate: boolean;
}> {
  const sql = db();
  const policy = await getOwnerPolicy(input.owner.type);
  const idempotencyKey = input.idempotencyKey?.trim() || generateIdempotencyKey();

  const existing = await sql<WithdrawalRow[]>`
    SELECT * FROM withdrawals WHERE idempotency_key = ${idempotencyKey} LIMIT 1
  `;
  if (existing[0]) {
    assertOwner(existing[0], input.owner);
    return { withdrawal: existing[0], duplicate: true };
  }

  if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) {
    throw ApiError.validation("Enter a valid withdrawal amount.");
  }
  if (!input.recipientCode.trim()) {
    throw ApiError.validation("Add and verify your bank account before withdrawing.");
  }

  // Cooling + daily-limit are enforced authoritatively inside the locked
  // transaction below (after lockWalletTx serializes concurrent requests).
  // NOTE: precheckWithdrawal() mirrors those checks so a doomed request
  // fails before its OTP is consumed — keep the three in sync.
  const settings = await payoutSettings();
  // Transfer-fee snapshot: stored per request so later config changes cannot
  // rewrite history. USER bearer → recipient gets amount − fee.
  const feeKobo = input.feeKobo ?? resolveTransferFeeKobo(settings);
  const feeBearer = input.feeBearer ?? resolveFeeBearer(settings);
  const netKobo = input.netKobo ?? computeNetKobo(input.amountKobo, feeKobo, feeBearer);
  if (feeBearer === "USER" && feeKobo > 0 && netKobo <= 0) {
    throw ApiError.validation("Amount is too small to cover the Paystack transfer fee.");
  }

  const reference = generateWithdrawalReference();
  try {
    const withdrawal = await sql.begin(async (tx) => {
      await ensureWalletTx(tx, input.owner);
      const balances = await lockWalletTx(tx, input.owner);
      // Authoritative cooling + daily-limit checks run AFTER the wallet lock
      // is held, so concurrent requests serialize here and each sees all
      // previously committed withdrawals (no TOCTOU bypass of the caps).
      const coolingHours = await getCoolingHours();
      const changedAt = await payoutAccountChangedAt(input.owner);
      if (isCoolingActive(changedAt, coolingHours)) {
        throw ApiError.conflict(
          `For your protection, withdrawals are paused for ${coolingHours} hours after a bank account change. Try again later or contact support.`,
        );
      }
      const dailyLimit = await getDailyLimit(input.owner.type);
      const todayCount = await countTodayWithdrawals(input.owner);
      if (isDailyLimitReached(todayCount, dailyLimit)) {
        throw ApiError.conflict(
          `Daily withdrawal limit reached (${dailyLimit} per day). Try again tomorrow.`,
        );
      }
      validateWithdrawalAmount(input.amountKobo, balances.available, policy);

      const nextAvailable = balances.available - input.amountKobo;
      await tx`
        UPDATE wallets SET available_kobo = ${nextAvailable}, updated_at = NOW()
        WHERE owner_type = ${input.owner.type} AND owner_id = ${input.owner.id}
      `;
      await tx`
        INSERT INTO wallet_entries
          (owner_type, owner_id, kind, amount_kobo, balance_after_kobo, meta)
        VALUES (
          ${input.owner.type}, ${input.owner.id}, 'withdrawal', ${-input.amountKobo}, ${nextAvailable},
          ${tx.json({ reference, amountKobo: input.amountKobo })}
        )
      `;

      const rows = await tx<WithdrawalRow[]>`
        INSERT INTO withdrawals
          (owner_type, owner_id, amount_kobo, recipient_code, bank_code, account_number,
           account_name, reference, status, idempotency_key, fee_kobo, net_kobo, fee_bearer)
        VALUES (
          ${input.owner.type}, ${input.owner.id}, ${input.amountKobo}, ${input.recipientCode.trim()},
          ${input.bankCode ?? null}, ${input.accountNumber ?? null}, ${input.accountName ?? null},
          ${reference}, 'PENDING', ${idempotencyKey}, ${feeKobo}, ${netKobo}, ${feeBearer}
        )
        RETURNING *
      `;
      const created = rows[0];
      await tx`
        UPDATE wallet_entries SET withdrawal_id = ${created.id}
        WHERE owner_type = ${input.owner.type} AND owner_id = ${input.owner.id}
          AND kind = 'withdrawal' AND withdrawal_id IS NULL
          AND meta->>'reference' = ${reference}
      `;
      return created;
    });
    return { withdrawal, duplicate: false };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await sql<WithdrawalRow[]>`
        SELECT * FROM withdrawals WHERE idempotency_key = ${idempotencyKey} LIMIT 1
      `;
      if (winner[0]) {
        assertOwner(winner[0], input.owner);
        return { withdrawal: winner[0], duplicate: true };
      }
    }
    throw error;
  }
}

/** Mark a withdrawal after the synchronous initiate-transfer response. */
export async function markWithdrawalSubmitted(input: {
  withdrawalId: string;
  status: Extract<WithdrawalStatus, "PROCESSING" | "SUCCESS" | "OTP">;
  transferCode?: string | null;
  failureReason?: string | null;
}): Promise<void> {
  const sql = db();
  await sql`
    UPDATE withdrawals
    SET status = ${input.status},
        paystack_transfer_code = COALESCE(${input.transferCode ?? null}, paystack_transfer_code),
        failure_reason = ${input.failureReason ?? null},
        paid_at = CASE WHEN ${input.status} = 'SUCCESS' THEN NOW() ELSE paid_at END,
        updated_at = NOW()
    WHERE id = ${input.withdrawalId} AND status IN ('PENDING', 'PROCESSING', 'OTP')
  `;
}

/** Park an ambiguous withdrawal (timeout/5xx) as PROCESSING — resolved later
 *  via webhook or GET /transfer/verify. Never auto-refund: Paystack may have
 *  accepted the transfer despite the failed response. */
export async function markWithdrawalProcessing(withdrawalId: string, reason: string): Promise<void> {
  const sql = db();
  await sql`
    UPDATE withdrawals
    SET status = 'PROCESSING', failure_reason = ${reason}, updated_at = NOW()
    WHERE id = ${withdrawalId} AND status = 'PENDING'
  `;
}

/**
 * Atomically claim a PENDING withdrawal for approval (PENDING → PROCESSING).
 * Returns true when this caller won the claim. Concurrent approvers lose
 * (zero rows) and must stop BEFORE any Paystack call — this is what prevents
 * double transfers for one withdrawal row.
 */
export async function claimWithdrawalForApproval(withdrawalId: string, adminId: string): Promise<boolean> {
  const sql = db();
  const claimed = await sql<{ id: string }[]>`
    UPDATE withdrawals
    SET status = 'PROCESSING', approved_by = ${adminId}, updated_at = NOW()
    WHERE id = ${withdrawalId} AND status = 'PENDING'
    RETURNING id
  `;
  return claimed.length > 0;
}

/**
 * Idempotent webhook applier for BOTH owner types. The caller must first
 * insert the event into paystack_webhook_events (ON CONFLICT DO NOTHING) —
 * if that insert finds an existing key, skip this function (replay).
 * FAILED/REVERSED restores the correct owner's balance with a
 * withdrawal_reversal entry. Returns the post-transition row, or null.
 */
export async function applyTransferWebhook(input: {
  event: string;
  reference: string;
  transferCode?: string | null;
  paystackStatus?: string | null;
  failureReason?: string | null;
}): Promise<WithdrawalRow | null> {
  const sql = db();
  const current = await sql<WithdrawalRow[]>`SELECT * FROM withdrawals WHERE reference = ${input.reference} LIMIT 1`;
  const next = nextWithdrawalStatus(current[0]?.status ?? "PENDING", input.event);
  if (!next && !shouldReverseForEvent(input.event) && input.event !== "transfer.success") return null;

  return sql.begin(async (tx) => {
    const rows = await tx<WithdrawalRow[]>`SELECT * FROM withdrawals WHERE reference = ${input.reference} FOR UPDATE`;
    const withdrawal = rows[0];
    if (!withdrawal) return null;
    const target = nextWithdrawalStatus(withdrawal.status, input.event);
    if (!target) return withdrawal;
    const owner: Owner = { type: withdrawal.owner_type, id: withdrawal.owner_id };

    const reversal = shouldReverseForEvent(input.event) && withdrawal.status !== target;
    await tx`
      UPDATE withdrawals
      SET status = ${target},
          paystack_transfer_code = COALESCE(${input.transferCode ?? null}, paystack_transfer_code),
          failure_reason = ${input.failureReason ?? (reversal ? input.event : null)},
          paid_at = CASE WHEN ${target} = 'SUCCESS' THEN NOW() ELSE paid_at END,
          updated_at = NOW()
      WHERE id = ${withdrawal.id}
    `;

    if (reversal) {
      const balances = await lockWalletTx(tx, owner);
      const available = balances.available + toInt(withdrawal.amount_kobo);
      await tx`
        UPDATE wallets SET available_kobo = ${available}, updated_at = NOW()
        WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
      `;
      await tx`
        INSERT INTO wallet_entries
          (owner_type, owner_id, kind, amount_kobo, balance_after_kobo, withdrawal_id, meta)
        VALUES (
          ${owner.type}, ${owner.id}, 'withdrawal_reversal', ${toInt(withdrawal.amount_kobo)},
          ${available}, ${withdrawal.id},
          ${tx.json({ event: input.event, reference: input.reference })}
        )
      `;
    }

    const updated = await tx<WithdrawalRow[]>`SELECT * FROM withdrawals WHERE id = ${withdrawal.id} LIMIT 1`;
    return updated[0] ?? null;
  });
}

/** Fail a withdrawal and restore funds (validation/4xx rejections only —
 *  never for ambiguous outcomes). */
export async function failWithdrawalAndReverse(withdrawalId: string, reason: string): Promise<void> {
  const sql = db();
  await sql.begin(async (tx) => {
    const rows = await tx<WithdrawalRow[]>`SELECT * FROM withdrawals WHERE id = ${withdrawalId} FOR UPDATE`;
    const withdrawal = rows[0];
    if (!withdrawal || isTerminalWithdrawalStatus(withdrawal.status)) return;
    const owner: Owner = { type: withdrawal.owner_type, id: withdrawal.owner_id };
    await tx`
      UPDATE withdrawals
      SET status = 'FAILED', failure_reason = ${reason}, updated_at = NOW()
      WHERE id = ${withdrawalId}
    `;
    const balances = await lockWalletTx(tx, owner);
    const available = balances.available + toInt(withdrawal.amount_kobo);
    await tx`
      UPDATE wallets SET available_kobo = ${available}, updated_at = NOW()
      WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
    `;
    await tx`
      INSERT INTO wallet_entries
        (owner_type, owner_id, kind, amount_kobo, balance_after_kobo, withdrawal_id, meta)
      VALUES (
        ${owner.type}, ${owner.id}, 'withdrawal_reversal', ${toInt(withdrawal.amount_kobo)},
        ${available}, ${withdrawalId}, ${tx.json({ reason })}
      )
    `;
  });
}
