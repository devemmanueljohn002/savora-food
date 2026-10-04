import { db, type Db } from "./db";
import { ApiError } from "./errors";
import {
  PaystackTransferError,
  createTransferRecipient,
  initiateTransfer,
  resolveAccount,
} from "./payments/transfers";
import {
  failWithdrawalAndReverse,
  getCoolingHours,
  getOwnerPolicy,
  getWalletBalance,
  isCoolingActive,
  koboToNaira,
  markWithdrawalProcessing,
  markWithdrawalSubmitted,
  releaseDueHolds,
  requestWithdrawal,
  type Owner,
  type OwnerPolicy,
  type WithdrawalRow,
} from "./wallet";

/**
 * Owner-agnostic payout service: one implementation for vendors AND riders.
 *
 * The only owner-specific parts are (a) which table holds the payout account
 * (vendors vs delivery_partners — both carry identical payout columns after
 * migration 008) and (b) the per-owner-type policy. Everything else — account
 * verification, cooling clocks, the deduct-then-transfer dance, reversal
 * handling — lives here once. API routes stay thin authenticated adapters.
 */

/** Whitelisted literal table names — never user input. */
const OWNER_TABLES = { VENDOR: "vendors", RIDER: "delivery_partners" } as const;

type PayoutAccountRow = {
  recipient_code: string | null;
  bank_code: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  payout_account_changed_at: Date | null;
};

export type PayoutAccount = {
  recipientCode: string | null;
  bankCode: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  verified: boolean;
  changedAt: Date | null;
  coolingHours: number;
  coolingActive: boolean;
  coolingEndsAt: Date | null;
};

async function readPayoutAccount(sql: Db, owner: Owner): Promise<PayoutAccountRow | undefined> {
  const table = OWNER_TABLES[owner.type];
  const rows = (await sql.unsafe(
    `SELECT recipient_code, bank_code, bank_name, bank_account_number, bank_account_name,
            payout_account_changed_at
     FROM ${table} WHERE id = $1 LIMIT 1`,
    [owner.id],
  )) as PayoutAccountRow[];
  return rows[0];
}

async function writePayoutAccount(
  sql: Db,
  owner: Owner,
  values: {
    recipientCode: string;
    bankCode: string;
    bankName: string | null;
    accountNumber: string;
    accountName: string;
    changed: boolean;
  },
): Promise<void> {
  const table = OWNER_TABLES[owner.type];
  // changed=true stamps the cooling clock; an identical re-save does not.
  await sql.unsafe(
    `UPDATE ${table}
     SET recipient_code = $1,
         bank_code = $2,
         bank_name = $3,
         bank_account_number = $4,
         bank_account_name = $5,
         payout_account_changed_at = CASE WHEN $6 THEN NOW() ELSE payout_account_changed_at END,
         updated_at = NOW()
     WHERE id = $7`,
    [
      values.recipientCode,
      values.bankCode,
      values.bankName,
      values.accountNumber,
      values.accountName,
      values.changed,
      owner.id,
    ],
  );
}

export async function getPayoutAccount(owner: Owner): Promise<PayoutAccount> {
  const sql = db();
  const row = await readPayoutAccount(sql, owner);
  const coolingHours = await getCoolingHours();
  const changedAt = row?.payout_account_changed_at ?? null;
  const coolingActive = isCoolingActive(changedAt, coolingHours);
  return {
    recipientCode: row?.recipient_code ?? null,
    bankCode: row?.bank_code ?? null,
    bankName: row?.bank_name ?? null,
    accountNumber: row?.bank_account_number ?? null,
    accountName: row?.bank_account_name ?? null,
    verified: Boolean(row?.recipient_code),
    changedAt,
    coolingHours,
    coolingActive,
    coolingEndsAt:
      changedAt && coolingActive ? new Date(new Date(changedAt).getTime() + coolingHours * 3_600_000) : null,
  };
}

/**
 * Verify + save the payout account for either owner type.
 *
 * The account holder NAME always comes from Paystack's resolve response, never
 * from the client — so a caller cannot name someone else's account. The stored
 * recipient_code is only swapped after Paystack confirms the account, and any
 * real change stamps payout_account_changed_at, starting the cooling window.
 */
export async function savePayoutAccount(
  owner: Owner,
  input: { accountNumber: string; bankCode: string },
): Promise<{ recipientCode: string; accountName: string; accountNumber: string; reused: boolean }> {
  const sql = db();
  const current = await readPayoutAccount(sql, owner);
  if (
    current?.recipient_code &&
    current.bank_account_number === input.accountNumber &&
    current.bank_code === input.bankCode
  ) {
    return {
      recipientCode: current.recipient_code,
      accountName: current.bank_account_name ?? "",
      accountNumber: current.bank_account_number ?? input.accountNumber,
      reused: true,
    };
  }

  // Step 1: prove the account exists and learn the real holder name.
  const resolved = await resolveAccount({
    accountNumber: input.accountNumber,
    bankCode: input.bankCode,
  });
  // Step 2: create the Paystack recipient under the verified name.
  const recipient = await createTransferRecipient({
    accountNumber: resolved.accountNumber,
    bankCode: input.bankCode,
    name: resolved.accountName,
  });
  if (!recipient.recipientCode) {
    throw ApiError.paymentError("Could not create the transfer recipient. Try again.");
  }

  const changed =
    !current?.recipient_code ||
    current.bank_account_number !== resolved.accountNumber ||
    current.bank_code !== input.bankCode;

  await writePayoutAccount(sql, owner, {
    recipientCode: recipient.recipientCode,
    bankCode: input.bankCode,
    bankName: current?.bank_name ?? null,
    accountNumber: resolved.accountNumber,
    accountName: resolved.accountName,
    changed,
  });

  return {
    recipientCode: recipient.recipientCode,
    accountName: resolved.accountName,
    accountNumber: resolved.accountNumber,
    reused: false,
  };
}

export type PayoutLimits = {
  minKobo: number;
  min: number;
  maxKobo: number;
  max: number;
  autoApproveBelowKobo: number;
  autoApproveBelow: number;
  holdDays: number;
};

export function describeLimits(policy: OwnerPolicy): PayoutLimits {
  return {
    minKobo: policy.minWithdrawalKobo,
    min: koboToNaira(policy.minWithdrawalKobo),
    maxKobo: policy.maxWithdrawalKobo,
    max: koboToNaira(policy.maxWithdrawalKobo),
    autoApproveBelowKobo: policy.autoApproveBelowKobo,
    autoApproveBelow: koboToNaira(policy.autoApproveBelowKobo),
    holdDays: policy.holdDays,
  };
}

/** Wallet + policy + cooling in one payload — the GET both owner routes return. */
export async function getPayoutOverview(owner: Owner, limit = 20): Promise<{
  ownerType: Owner["type"];
  availableKobo: number;
  available: number;
  pendingKobo: number;
  pending: number;
  limits: PayoutLimits;
  account: PayoutAccount;
  withdrawals: Array<ReturnType<typeof toWithdrawalResponse>>;
}> {
  const [balance, policy, account, rows] = await Promise.all([
    getWalletBalance(owner),
    getOwnerPolicy(owner.type),
    getPayoutAccount(owner),
    listWithdrawals(owner, limit),
  ]);
  return {
    ownerType: owner.type,
    availableKobo: balance.availableKobo,
    available: koboToNaira(balance.availableKobo),
    pendingKobo: balance.pendingKobo,
    pending: koboToNaira(balance.pendingKobo),
    limits: describeLimits(policy),
    account,
    withdrawals: rows.map(toWithdrawalResponse),
  };
}

export function toWithdrawalResponse(row: WithdrawalRow) {
  return {
    id: row.id,
    amountKobo: Number(row.amount_kobo),
    amount: koboToNaira(Number(row.amount_kobo)),
    reference: row.reference,
    transferCode: row.paystack_transfer_code,
    status: row.status,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}

export async function listWithdrawals(owner: Owner, limit = 20): Promise<WithdrawalRow[]> {
  return db()<WithdrawalRow[]>`
    SELECT * FROM withdrawals
    WHERE owner_type = ${owner.type} AND owner_id = ${owner.id}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export type WithdrawResult = {
  withdrawal: WithdrawalRow;
  duplicate: boolean;
  awaitingApproval: boolean;
};

/**
 * Shared withdrawal flow for any owner type.
 *
 * Never trusts the client for owner ID (session-derived only) or amount
 * (re-checked against the locked balance + per-owner policy). Sequence:
 * deduct + create PENDING in ONE transaction → commit → call Paystack. Above
 * the auto-approve threshold the row parks for finance approval and no
 * Paystack call happens yet.
 */
export async function withdraw(input: {
  owner: Owner;
  amountKobo: number;
  idempotencyKey?: string | null;
}): Promise<WithdrawResult> {
  const policy = await getOwnerPolicy(input.owner.type);
  if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) {
    throw ApiError.validation("Enter a valid withdrawal amount.");
  }
  if (input.amountKobo > policy.maxWithdrawalKobo) {
    throw ApiError.validation(
      `Maximum withdrawal is ₦${koboToNaira(policy.maxWithdrawalKobo).toLocaleString()}. Contact support for larger payouts.`,
    );
  }

  const account = await getPayoutAccount(input.owner);
  if (!account.recipientCode) {
    throw ApiError.validation("Add and verify your bank account before withdrawing.");
  }

  // Matured holds unlock here too (not just on balance views), so an owner
  // who goes straight to withdraw is measured against released funds.
  await releaseDueHolds(input.owner).catch(() => undefined);

  const { withdrawal, duplicate } = await requestWithdrawal({
    owner: input.owner,
    amountKobo: input.amountKobo,
    recipientCode: account.recipientCode,
    bankCode: account.bankCode,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    idempotencyKey: input.idempotencyKey,
  });
  if (duplicate) {
    return { withdrawal, duplicate: true, awaitingApproval: false };
  }

  // Large withdrawals park for finance approval — no Paystack call yet.
  if (input.amountKobo > policy.autoApproveBelowKobo) {
    return { withdrawal, duplicate: false, awaitingApproval: true };
  }

  const submitted = await initiateTransferAndRecord({
    withdrawalId: withdrawal.id,
    amountKobo: Number(withdrawal.amount_kobo),
    recipientCode: withdrawal.recipient_code,
    reference: withdrawal.reference,
  });
  return { withdrawal: submitted, duplicate: false, awaitingApproval: false };
}

/**
 * Kick off the Paystack transfer AFTER the deduction committed and record the
 * synchronous outcome.
 *
 * Ambiguous failures (timeout/5xx/network) park the withdrawal as PROCESSING:
 * Paystack may still have accepted it, so we never auto-refund on a guess —
 * the webhook (or GET /transfer/verify) decides. Only definitive rejections
 * (validation/4xx) restore the balance immediately.
 */
export async function initiateTransferAndRecord(input: {
  withdrawalId: string;
  amountKobo: number;
  recipientCode: string;
  reference: string;
}): Promise<WithdrawalRow> {
  const sql = db();
  try {
    const result = await initiateTransfer({
      amountKobo: input.amountKobo,
      recipientCode: input.recipientCode,
      reference: input.reference,
    });
    if (result.requiresOtp) {
      await markWithdrawalSubmitted({
        withdrawalId: input.withdrawalId,
        status: "OTP",
        transferCode: result.transferCode,
        failureReason: "Paystack requires OTP confirmation. Approve the transfer in the Paystack dashboard.",
      });
    } else if (result.status === "success") {
      await markWithdrawalSubmitted({
        withdrawalId: input.withdrawalId,
        status: "SUCCESS",
        transferCode: result.transferCode,
      });
    } else {
      await markWithdrawalSubmitted({
        withdrawalId: input.withdrawalId,
        status: "PROCESSING",
        transferCode: result.transferCode,
      });
    }
  } catch (error) {
    if (error instanceof PaystackTransferError) {
      if (error.ambiguous) {
        await markWithdrawalProcessing(input.withdrawalId, error.paystackMessage).catch(() => undefined);
      } else {
        await failWithdrawalAndReverse(input.withdrawalId, error.paystackMessage).catch(() => undefined);
      }
    } else {
      await markWithdrawalProcessing(input.withdrawalId, "Transfer initiation failed.").catch(() => undefined);
    }
    throw error;
  }

  const rows = await sql<WithdrawalRow[]>`SELECT * FROM withdrawals WHERE id = ${input.withdrawalId} LIMIT 1`;
  const updated = rows[0];
  if (!updated) throw ApiError.internal();
  return updated;
}