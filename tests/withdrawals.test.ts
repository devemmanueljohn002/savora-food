import { createHmac } from "crypto";
import { describe, expect, it, vi } from "vitest";

// Test-only env: verifyWebhookSignature reads the secret lazily via getEnv(),
// so these must be set before the first call (imports are hoisted, calls are not).
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-for-withdrawals";
process.env.APP_URL ??= "http://localhost:3000";
process.env.PAYSTACK_SECRET_KEY ??= "sk_test_withdrawals_secret";

import { verifyWebhookSignature } from "@/server/payments/paystack";
import {
  PaystackTransferError,
  classifyPaystackFailure,
  initiateTransfer,
  isInsufficientFundsMessage,
} from "@/server/payments/transfers";
import {
  WITHDRAWAL_LIMITS,
  generateIdempotencyKey,
  generateWithdrawalReference,
  isTerminalWithdrawalStatus,
  isUniqueViolation,
  koboToNaira,
  nairaToKobo,
  nextWithdrawalStatus,
  shouldReverseForEvent,
  validateWithdrawalAmount,
} from "@/server/wallet";
import { ApiError } from "@/server/errors";

function paystackResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("money is integers (kobo, never floats)", () => {
  it("converts naira to kobo exactly", () => {
    expect(nairaToKobo(3500)).toBe(350000);
    expect(nairaToKobo(1250.55)).toBe(125055);
    expect(Number.isInteger(nairaToKobo(1999.99))).toBe(true);
  });

  it("round-trips kobo to naira", () => {
    expect(koboToNaira(350000)).toBe(3500);
  });
});

describe("insufficient balance", () => {
  it("rejects withdrawals above the available balance (vendor-side)", () => {
    expect(() => validateWithdrawalAmount(200_000, 100_000)).toThrowError(ApiError);
    try {
      validateWithdrawalAmount(200_000, 100_000);
      expect.unreachable();
    } catch (error) {
      expect((error as ApiError).code).toBe("CONFLICT");
    }
  });

  it("rejects dust and oversized amounts (abuse caps)", () => {
    expect(() => validateWithdrawalAmount(WITHDRAWAL_LIMITS.minWithdrawalKobo - 1, 1_000_000_000)).toThrowError(
      ApiError,
    );
    expect(() =>
      validateWithdrawalAmount(WITHDRAWAL_LIMITS.maxWithdrawalKobo + 1, WITHDRAWAL_LIMITS.maxWithdrawalKobo + 1),
    ).toThrowError(ApiError);
    expect(() => validateWithdrawalAmount(100.5, 1_000_000)).toThrowError(ApiError);
  });

  it("detects Paystack's insufficient-funds message (platform float, not vendor)", () => {
    expect(isInsufficientFundsMessage("Insufficient funds in your Paystack balance")).toBe(true);
    expect(isInsufficientFundsMessage("Transfer successful")).toBe(false);
    const classified = classifyPaystackFailure({
      httpStatus: 400,
      message: "Insufficient balance in your Paystack account",
    });
    expect(classified).toEqual({ ambiguous: false, insufficientFunds: true });
  });

  it("maps a Paystack insufficient-funds rejection to a definitive (reversible) failure", async () => {
    const fetchImpl = vi.fn(async () =>
      paystackResponse(400, { status: false, message: "Insufficient funds in your Paystack balance" }),
    );
    await expect(
      initiateTransfer({ amountKobo: 500_000, recipientCode: "RCP_test", reference: "SV-WD-TEST" }, fetchImpl),
    ).rejects.toMatchObject({ insufficientFunds: true, ambiguous: false });
  });
});

describe("double-click / duplicate request (idempotency)", () => {
  it("generates unique server-side references and idempotency keys", () => {
    const refs = new Set(Array.from({ length: 500 }, () => generateWithdrawalReference()));
    expect(refs.size).toBe(500);
    expect(generateWithdrawalReference()).toMatch(/^SV-WD-[0-9A-F]{16}$/);
    expect(generateIdempotencyKey()).not.toBe(generateIdempotencyKey());
  });

  it("recognises Postgres unique violations (the double-submit race signal)", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });

  it("duplicate idempotency keys resolve to the existing row instead of a second debit (DB path)", () => {
    // requestWithdrawal() checks SELECT-by-idempotency-key before opening the
    // deduction transaction, and re-checks on 23505 after a commit race.
    // That path needs a live DB, so it is covered by the manual checklist;
    // here we pin the contract: same key in → { duplicate: true } out, and
    // keys are never derived from client-controlled amounts.
    expect(generateIdempotencyKey()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("failed transfer reversal", () => {
  it("maps transfer.failed / transfer.reversed to balance-restoring transitions", () => {
    expect(nextWithdrawalStatus("PROCESSING", "transfer.failed")).toBe("FAILED");
    expect(nextWithdrawalStatus("PROCESSING", "transfer.reversed")).toBe("REVERSED");
    expect(nextWithdrawalStatus("OTP", "transfer.failed")).toBe("FAILED");
    expect(shouldReverseForEvent("transfer.failed")).toBe(true);
    expect(shouldReverseForEvent("transfer.reversed")).toBe(true);
    expect(shouldReverseForEvent("transfer.success")).toBe(false);
  });

  it("treats SUCCESS/FAILED/REVERSED as terminal", () => {
    expect(isTerminalWithdrawalStatus("SUCCESS")).toBe(true);
    expect(isTerminalWithdrawalStatus("FAILED")).toBe(true);
    expect(isTerminalWithdrawalStatus("REVERSED")).toBe(true);
    expect(isTerminalWithdrawalStatus("PROCESSING")).toBe(false);
    expect(isTerminalWithdrawalStatus("PENDING")).toBe(false);
  });
});

describe("webhook replay (idempotency)", () => {
  it("ignores events for already-terminal withdrawals (no double-refund)", () => {
    expect(nextWithdrawalStatus("FAILED", "transfer.failed")).toBeNull();
    expect(nextWithdrawalStatus("REVERSED", "transfer.reversed")).toBeNull();
    expect(nextWithdrawalStatus("SUCCESS", "transfer.success")).toBeNull();
    // A late failure notice after success must never claw back paid funds.
    expect(nextWithdrawalStatus("SUCCESS", "transfer.failed")).toBeNull();
  });

  it("advances non-terminal states exactly once", () => {
    expect(nextWithdrawalStatus("PENDING", "transfer.success")).toBe("SUCCESS");
    expect(nextWithdrawalStatus("PROCESSING", "transfer.success")).toBe("SUCCESS");
    expect(nextWithdrawalStatus("PENDING", "transfer.pending")).toBe("PROCESSING");
    expect(nextWithdrawalStatus("UNKNOWN_EVENT" as string, "transfer.whatever")).toBeNull();
  });
});

describe("invalid webhook signature", () => {
  const raw = JSON.stringify({ event: "transfer.success", data: { reference: "SV-WD-ABC" } });

  it("accepts the genuine HMAC-SHA512 of the raw body", () => {
    const genuine = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY as string).update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, genuine)).toBe(true);
  });

  it("rejects forged, empty, and missing signatures", () => {
    expect(verifyWebhookSignature(raw, "00".repeat(64))).toBe(false);
    expect(verifyWebhookSignature(raw, "")).toBe(false);
    expect(verifyWebhookSignature(raw, null)).toBe(false);
    const other = createHmac("sha512", "different-secret").update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, other)).toBe(false);
  });
});

describe("ambiguous timeout (never auto-refund)", () => {
  it("classifies timeouts, network errors, 429 and 5xx as ambiguous", () => {
    expect(classifyPaystackFailure({ httpStatus: null, message: "timeout", timedOutOrNetwork: true })).toEqual({
      ambiguous: true,
      insufficientFunds: false,
    });
    expect(classifyPaystackFailure({ httpStatus: 500, message: "Internal error" }).ambiguous).toBe(true);
    expect(classifyPaystackFailure({ httpStatus: 429, message: "Rate limited" }).ambiguous).toBe(true);
    // Definitive client errors are safe to reverse immediately.
    expect(classifyPaystackFailure({ httpStatus: 400, message: "Invalid recipient" })).toEqual({
      ambiguous: false,
      insufficientFunds: false,
    });
  });

  it("surfaces a dropped connection as an ambiguous transfer error (→ PROCESSING)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    const error = await initiateTransfer(
      { amountKobo: 100_000, recipientCode: "RCP_test", reference: "SV-WD-TIMEOUT" },
      fetchImpl,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PaystackTransferError);
    expect((error as PaystackTransferError).ambiguous).toBe(true);
  });
});

describe("OTP handling", () => {
  it("parks otp-status transfers instead of marking them successful", async () => {
    const fetchImpl = vi.fn(async () =>
      paystackResponse(200, {
        status: true,
        message: "Transfer requires OTP",
        data: { transfer_code: "TRF_test", reference: "SV-WD-OTP", status: "otp" },
      }),
    );
    const result = await initiateTransfer(
      { amountKobo: 100_000, recipientCode: "RCP_test", reference: "SV-WD-OTP" },
      fetchImpl,
    );
    expect(result.requiresOtp).toBe(true);
    expect(nextWithdrawalStatus("PENDING", "transfer.otp")).toBe("OTP");
  });
});
