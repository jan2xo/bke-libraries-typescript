export const paymentErrorCodes = [
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

export type PaymentErrorCode = (typeof paymentErrorCodes)[number];

export class PaymentLifecycleError extends Error {
  constructor(
    public readonly code: PaymentErrorCode,
    public readonly retryable = false,
  ) {
    super(code);
    this.name = "PaymentLifecycleError";
  }
}

export function safePaymentError(error: unknown): PaymentErrorCode {
  if (error instanceof PaymentLifecycleError) return error.code;
  return "PAYMENT_PROCESSING_FAILED";
}
