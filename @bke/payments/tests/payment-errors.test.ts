import { describe, expect, it } from "vitest";
import {
  PaymentLifecycleError,
  paymentErrorCodes,
  safePaymentError,
} from "../logic/payment-errors";

const expectedCodes = [
  "PAYMENT_SIGNATURE_INVALID",
  "PAYMENT_SIGNATURE_STALE",
  "PAYMENT_EVENT_REPLAY_CONFLICT",
  "PAYMENT_AMOUNT_MISMATCH",
  "PAYMENT_CURRENCY_MISMATCH",
  "PAYMENT_REFERENCE_MISMATCH",
  "PAYMENT_CHECKOUT_MISMATCH",
  "PAYMENT_MODE_MISMATCH",
  "PAYMENT_EVENT_UNSUPPORTED",
  "PAYMENT_ALREADY_SETTLED",
  "PAYMENT_REFUND_NOT_ALLOWED",
  "PAYMENT_REFUND_CONFLICT",
  "PAYMENT_RECONCILIATION_REQUIRED",
  "PAYMENT_PROVIDER_UNAVAILABLE",
  "PAYMENT_PROCESSING_RETRYABLE",
  "PAYMENT_PROCESSING_FAILED",
] as const;

describe("Payments lifecycle errors", () => {
  it("preserves the certified V1 error-code surface exactly", () => {
    expect(paymentErrorCodes).toEqual(expectedCodes);
  });

  it("preserves typed lifecycle errors and retryability", () => {
    const error = new PaymentLifecycleError("PAYMENT_PROCESSING_RETRYABLE", true);
    expect(error.name).toBe("PaymentLifecycleError");
    expect(error.message).toBe("PAYMENT_PROCESSING_RETRYABLE");
    expect(error.code).toBe("PAYMENT_PROCESSING_RETRYABLE");
    expect(error.retryable).toBe(true);
    expect(safePaymentError(error)).toBe("PAYMENT_PROCESSING_RETRYABLE");
  });

  it("fails closed to PAYMENT_PROCESSING_FAILED for unknown errors", () => {
    expect(safePaymentError(new Error("provider detail"))).toBe("PAYMENT_PROCESSING_FAILED");
    expect(safePaymentError(null)).toBe("PAYMENT_PROCESSING_FAILED");
  });
});
