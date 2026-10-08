import { ApiError } from "../errors";
import { getEnv } from "../env";

/**
 * Paystack Transfers API (withdrawals rail — separate from the
 * transaction/initialize collection rail in paystack.ts).
 *
 * Docs behavior encoded here (flagged UNCERTAIN where the repo could not
 * verify it — see Final Report): transfers debit the Paystack *balance*,
 * amounts are kobo integers, recipient creation needs type "nuban".
 *
 * All functions accept an injectable fetchImpl so tests can simulate
 * success / failure / timeout without network access.
 */

const PAYSTACK_API = "https://api.paystack.co";
const TRANSFER_TIMEOUT_MS = 20_000;

function requireSecretKey(): string {
  const secret = getEnv().paystackSecretKey;
  if (!secret) {
    throw ApiError.paymentError("Payments are not configured on this server.");
  }
  return secret;
}

export type FetchImpl = typeof fetch;

export class PaystackTransferError extends Error {
  readonly httpStatus: number | null;
  readonly paystackMessage: string;
  /** Network/timeout/5xx/429: Paystack may have accepted the transfer. NEVER auto-refund these. */
  readonly ambiguous: boolean;
  /** The platform's own Paystack balance is empty — reverse + alert finance. */
  readonly insufficientFunds: boolean;

  constructor(input: {
    message: string;
    paystackMessage?: string;
    httpStatus?: number | null;
    ambiguous?: boolean;
    insufficientFunds?: boolean;
  }) {
    super(input.message);
    this.name = "PaystackTransferError";
    this.httpStatus = input.httpStatus ?? null;
    this.paystackMessage = input.paystackMessage ?? input.message;
    this.ambiguous = input.ambiguous ?? false;
    this.insufficientFunds = input.insufficientFunds ?? false;
  }
}

/** "Insufficient funds in your Paystack balance" — the platform's float, not the vendor's. */
export function isInsufficientFundsMessage(message: string): boolean {
  return /insufficient\s+(funds|balance)/i.test(message);
}

/**
 * Classify a failed Paystack call. Pure (unit-tested):
 * - timeout / network / 5xx / 429 → ambiguous (may have been accepted).
 * - insufficient-funds message → definitive failure, reverse + alert.
 * - other 4xx → definitive failure (rejected pre-submission).
 */
export function classifyPaystackFailure(input: {
  httpStatus: number | null;
  message: string;
  timedOutOrNetwork?: boolean;
}): { ambiguous: boolean; insufficientFunds: boolean } {
  const insufficientFunds = isInsufficientFundsMessage(input.message);
  if (insufficientFunds) return { ambiguous: false, insufficientFunds: true };
  if (input.timedOutOrNetwork) return { ambiguous: true, insufficientFunds: false };
  if (input.httpStatus === null) return { ambiguous: true, insufficientFunds: false };
  if (input.httpStatus === 429 || input.httpStatus >= 500) {
    return { ambiguous: true, insufficientFunds: false };
  }
  return { ambiguous: false, insufficientFunds: false };
}

type PaystackEnvelope<T> = {
  status: boolean;
  message?: string;
  data: T;
  /** Present on paginated list endpoints (e.g. GET /bank with use_cursor=true). */
  meta?: {
    next?: string | null;
    previous?: string | null;
    perPage?: number;
  } | null;
};

type PaystackRequestInit = { method?: string; body?: unknown; fetchImpl?: FetchImpl; timeoutMs?: number };

/** Raw fetch: auth header + timeout + network-error mapping. No status check. */
async function paystackRaw<T>(
  path: string,
  init: PaystackRequestInit = {},
): Promise<{ response: Response; body: PaystackEnvelope<T> | null }> {
  const secret = requireSecretKey();
  const fetchImpl = init.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? TRANSFER_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(`${PAYSTACK_API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
        ...(init.method && init.method !== "GET" ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    // Network error or our own timeout: outcome UNKNOWN.
    const { ambiguous } = classifyPaystackFailure({
      httpStatus: null,
      message: error instanceof Error ? error.message : "Network error.",
      timedOutOrNetwork: true,
    });
    throw new PaystackTransferError({
      message: "Could not reach Paystack. Your withdrawal is marked as processing and will be resolved automatically.",
      paystackMessage: error instanceof Error ? error.message : "Network error.",
      httpStatus: null,
      ambiguous,
    });
  } finally {
    clearTimeout(timeout);
  }

  const body = (await response.json().catch(() => null)) as PaystackEnvelope<T> | null;
  return { response, body };
}

/** Shared failure mapping for non-OK Paystack responses. */
function throwForPaystackFailure(response: Response, body: PaystackEnvelope<unknown> | null): never {
  const message = body?.message ?? `Paystack returned an error (${response.status}).`;
  const { ambiguous, insufficientFunds } = classifyPaystackFailure({
    httpStatus: response.status,
    message,
  });
  throw new PaystackTransferError({
    message,
    paystackMessage: message,
    httpStatus: response.status,
    ambiguous,
    insufficientFunds,
  });
}

async function paystackRequest<T>(path: string, init: PaystackRequestInit = {}): Promise<T> {
  const { response, body } = await paystackRaw<T>(path, init);
  if (!response.ok || !body || body.status === false) {
    throwForPaystackFailure(response, body);
  }
  return body.data;
}

/** Same as paystackRequest but also returns the pagination cursor (meta). */
async function paystackRequestWithMeta<T>(
  path: string,
  init: PaystackRequestInit = {},
): Promise<{ data: T; next: string | null }> {
  const { response, body } = await paystackRaw<T>(path, init);
  if (!response.ok || !body || body.status === false) {
    throwForPaystackFailure(response, body);
  }
  return { data: body.data, next: body.meta?.next ?? null };
}

// ── Bank list + account verification ─────────────────────────────────────────

export type PaystackBank = {
  name: string;
  slug: string;
  code: string;
  longcode: string;
  country: string;
  currency: string;
  type: string;
};

const BANK_PAGE_SIZE = 100;
/** Safety cap: 10 pages × 100 banks — far above the ~200 Nigerian banks Paystack lists. */
const BANK_MAX_PAGES = 10;

/**
 * Full Nigerian bank list. Follows Paystack's cursor pagination
 * (meta.next) until every page is loaded — a single page is capped at 100.
 */
export async function listBanks(fetchImpl?: FetchImpl): Promise<PaystackBank[]> {
  const all: PaystackBank[] = [];
  let next: string | null = null;
  for (let page = 0; page < BANK_MAX_PAGES; page++) {
    const path: string =
      `/bank?country=nigeria&perPage=${BANK_PAGE_SIZE}&use_cursor=true` +
      (next ? `&next=${encodeURIComponent(next)}` : "");
    const { data, next: following }: { data: PaystackBank[]; next: string | null } =
      await paystackRequestWithMeta<PaystackBank[]>(path, { fetchImpl });
    if (Array.isArray(data)) all.push(...data);
    if (!following) break;
    next = following;
  }
  return all;
}

export type ResolveAccountResult = {
  accountNumber: string;
  accountName: string;
  bankId: number | null;
};

export async function resolveAccount(
  input: { accountNumber: string; bankCode: string },
  fetchImpl?: FetchImpl,
): Promise<ResolveAccountResult> {
  if (!/^\d{10}$/.test(input.accountNumber.trim())) {
    throw ApiError.validation("Enter a valid 10-digit account number.");
  }
  if (!input.bankCode.trim()) {
    throw ApiError.validation("Select a bank.");
  }
  const data = await paystackRequest<{ account_number: string; account_name: string; bank_id?: number }>(
    `/bank/resolve?account_number=${encodeURIComponent(input.accountNumber.trim())}&bank_code=${encodeURIComponent(input.bankCode.trim())}`,
    { fetchImpl },
  );
  return {
    accountNumber: data.account_number,
    accountName: data.account_name,
    bankId: typeof data.bank_id === "number" ? data.bank_id : null,
  };
}

// ── Transfer recipients ──────────────────────────────────────────────────────

export type CreateRecipientResult = {
  recipientCode: string;
  active: boolean;
  name: string;
};

export async function createTransferRecipient(
  input: { accountNumber: string; bankCode: string; name: string },
  fetchImpl?: FetchImpl,
): Promise<CreateRecipientResult> {
  const data = await paystackRequest<{
    recipient_code: string;
    active?: boolean;
    name?: string;
    details?: { account_name?: string };
  }>(
    "/transferrecipient",
    {
      method: "POST",
      fetchImpl,
      body: {
        type: "nuban",
        currency: "NGN",
        account_number: input.accountNumber.trim(),
        bank_code: input.bankCode.trim(),
        name: input.name.trim(),
      },
    },
  );
  return {
    recipientCode: data.recipient_code,
    active: data.active !== false,
    name: data.name ?? data.details?.account_name ?? input.name,
  };
}

// ── Transfers ────────────────────────────────────────────────────────────────

export type InitiateTransferResult = {
  /** Paystack's transfer_code (their id), distinct from our reference. */
  transferCode: string | null;
  /** Our reference echoed back. */
  reference: string;
  /** "success" | "pending" | "otp" — UNCERTAIN: exact strings per Paystack docs; "otp" handled explicitly. */
  status: string;
  requiresOtp: boolean;
};

export async function initiateTransfer(
  input: { amountKobo: number; recipientCode: string; reference: string; reason?: string },
  fetchImpl?: FetchImpl,
): Promise<InitiateTransferResult> {
  if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) {
    throw ApiError.validation("Invalid transfer amount.");
  }
  const data = await paystackRequest<{
    transfer_code?: string;
    reference?: string;
    status?: string;
  }>(
    "/transfer",
    {
      method: "POST",
      fetchImpl,
      body: {
        source: "balance",
        amount: input.amountKobo,
        recipient: input.recipientCode,
        reference: input.reference,
        reason: input.reason ?? "Savora Food vendor withdrawal",
      },
    },
  );
  const status = String(data.status ?? "pending").toLowerCase();
  return {
    transferCode: data.transfer_code ?? null,
    reference: data.reference ?? input.reference,
    status,
    requiresOtp: status === "otp",
  };
}

export type VerifyTransferResult = {
  status: string;
  transferCode: string | null;
  amountKobo: number | null;
};

export async function verifyTransfer(reference: string, fetchImpl?: FetchImpl): Promise<VerifyTransferResult> {
  const data = await paystackRequest<{
    status?: string;
    transfer_code?: string;
    amount?: number;
  }>(`/transfer/verify/${encodeURIComponent(reference)}`, { fetchImpl });
  return {
    status: String(data.status ?? "unknown").toLowerCase(),
    transferCode: data.transfer_code ?? null,
    amountKobo: typeof data.amount === "number" ? data.amount : null,
  };
}
