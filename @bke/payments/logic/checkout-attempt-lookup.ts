import type {
  PaymentsCheckoutAttemptLookupCapability,
  PaymentsFindCheckoutAttemptInput,
  PaymentsFindCheckoutAttemptResult,
} from "../contracts/checkout-attempt-lookup.contract";
import type { PaymentsCheckoutAttemptRepository } from "./checkout-attempt-repository";

export function createPaymentsCheckoutAttemptLookupCapability(
  repository: PaymentsCheckoutAttemptRepository,
): PaymentsCheckoutAttemptLookupCapability {
  return Object.freeze({
    async find(input: PaymentsFindCheckoutAttemptInput): Promise<PaymentsFindCheckoutAttemptResult> {
      const sourceReference = input.sourceReference.trim();
      if (!sourceReference || sourceReference.length > 200) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        const record = await repository.findBySourceReference(sourceReference);
        if (!record) return { status: "NOT_FOUND" };
        return {
          status: "FOUND",
          value: Object.freeze({
            attemptId: record.id,
            sourceReference: record.sourceReference,
            commercialReference: record.commercialReference,
            status: record.status,
            checkoutUrl: record.checkoutUrl,
            failureCode: record.failureCode,
            amountMinor: record.amountMinor,
            currency: record.currency,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          }),
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
