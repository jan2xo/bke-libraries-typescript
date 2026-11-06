import { randomUUID } from "node:crypto";
import type { PaymentsReconcileSettlementInput, PaymentsReconcileSettlementResult, PaymentsSettlementFactCapability, PaymentsSettlementFactSnapshot } from "../contracts/settlement-fact.contract";
import type { PaymentsSettlementFactClaim, PaymentsSettlementFactRepository } from "./settlement-fact-repository";
function equivalent(record: PaymentsSettlementFactSnapshot, claim: PaymentsSettlementFactClaim): boolean {
  return record.checkoutAttemptId === claim.checkoutAttemptId && record.provider === claim.provider &&
    record.externalPaymentId === claim.externalPaymentId && (record.externalCheckoutId ?? null) === claim.externalCheckoutId &&
    (record.paymentIntentId ?? null) === claim.paymentIntentId && record.commercialReference === claim.commercialReference &&
    record.amountMinor === claim.amountMinor && record.currency === claim.currency && record.livemode === claim.livemode;
}
export function createPaymentsSettlementFactCapability(repository: PaymentsSettlementFactRepository): PaymentsSettlementFactCapability {
  return Object.freeze({
    async reconcile(input: PaymentsReconcileSettlementInput): Promise<PaymentsReconcileSettlementResult> {
      const eventId = input?.providerEventRecordId?.trim();
      if (!eventId || typeof input.expectedLivemode !== "boolean") return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const event = await repository.findProviderEventById(eventId);
        if (!event) return { status: "REJECTED", code: "EVENT_NOT_FOUND" };
        if (event.type !== "payment.paid") return { status: "REJECTED", code: "UNSUPPORTED_EVENT" };
        if (event.livemode !== input.expectedLivemode) return { status: "REJECTED", code: "MODE_MISMATCH" };
        if (!event.externalPaymentId) return { status: "REJECTED", code: "PAYMENT_REFERENCE_MISSING" };
        let attemptId: string, commercialReference: string, amountMinor: number, currency: string;
        let checkoutId: string | null = null, intentId: string | null = null;
        if (event.paymentIntentId && !event.externalCheckoutId) {
          if (!repository.findPaymentIntentAttempt) return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
          const attempt = await repository.findPaymentIntentAttempt(event.provider, event.paymentIntentId);
          if (!attempt || attempt.paymentIntentId !== event.paymentIntentId || attempt.status === "FAILED" || attempt.status === "CANCELLED") {
            return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
          }
          attemptId = attempt.id; commercialReference = attempt.commercialReference; amountMinor = attempt.amountMinor;
          currency = attempt.currency; intentId = event.paymentIntentId;
        } else if (event.externalCheckoutId) {
          const attempt = await repository.findCheckoutAttempt(event.provider, event.externalCheckoutId);
          if (!attempt || (attempt.status !== "PENDING" && attempt.status !== "CANCELLED") || attempt.externalCheckoutId !== event.externalCheckoutId) {
            return { status: "REJECTED", code: "CHECKOUT_MISMATCH" };
          }
          attemptId = attempt.id; commercialReference = attempt.commercialReference; amountMinor = attempt.amountMinor;
          currency = attempt.currency; checkoutId = event.externalCheckoutId; intentId = event.paymentIntentId ?? null;
        } else return { status: "REJECTED", code: "CHECKOUT_MISMATCH" };
        if (!event.reference || event.reference !== commercialReference) return { status: "REJECTED", code: "REFERENCE_MISMATCH" };
        if (event.amountMinor === null || event.amountMinor !== amountMinor) return { status: "REJECTED", code: "AMOUNT_MISMATCH" };
        if (!event.currency || event.currency.toUpperCase() !== currency.toUpperCase()) return { status: "REJECTED", code: "CURRENCY_MISMATCH" };
        const claim: PaymentsSettlementFactClaim = {
          id: randomUUID(), providerEventRecordId: event.id, checkoutAttemptId: attemptId, provider: event.provider,
          eventId: event.eventId, externalPaymentId: event.externalPaymentId, externalCheckoutId: checkoutId,
          paymentIntentId: intentId, commercialReference, amountMinor, currency: currency.toUpperCase(),
          livemode: event.livemode, settledAt: event.occurredAt,
        };
        const result = await repository.claim(claim);
        if (!result.created && !equivalent(result.record, claim)) return { status: "REJECTED", code: "SETTLEMENT_CONFLICT" };
        return { status: "SETTLED", disposition: result.created ? "CREATED" : "EXISTING", value: result.record };
      } catch { return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" }; }
    },
  });
}
