import { randomUUID } from "node:crypto";
import type {
  PaymentsReconcileSettlementInput,
  PaymentsReconcileSettlementResult,
  PaymentsSettlementFactCapability,
  PaymentsSettlementFactSnapshot,
} from "../contracts/settlement-fact.contract";
import type {
  PaymentsSettlementFactClaim,
  PaymentsSettlementFactRepository,
} from "./settlement-fact-repository";

function equivalent(
  record: PaymentsSettlementFactSnapshot,
  claim: PaymentsSettlementFactClaim,
): boolean {
  return (
    record.providerEventRecordId === claim.providerEventRecordId &&
    record.checkoutAttemptId === claim.checkoutAttemptId &&
    record.provider === claim.provider &&
    record.eventId === claim.eventId &&
    record.externalPaymentId === claim.externalPaymentId &&
    record.externalCheckoutId === claim.externalCheckoutId &&
    record.commercialReference === claim.commercialReference &&
    record.amountMinor === claim.amountMinor &&
    record.currency === claim.currency &&
    record.livemode === claim.livemode &&
    record.settledAt.getTime() === claim.settledAt.getTime()
  );
}

export function createPaymentsSettlementFactCapability(
  repository: PaymentsSettlementFactRepository,
): PaymentsSettlementFactCapability {
  return Object.freeze({
    async reconcile(input: PaymentsReconcileSettlementInput): Promise<PaymentsReconcileSettlementResult> {
      const providerEventRecordId = input?.providerEventRecordId?.trim();
      if (!providerEventRecordId || typeof input.expectedLivemode !== "boolean") {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        const event = await repository.findProviderEventById(providerEventRecordId);
        if (!event) return { status: "REJECTED", code: "EVENT_NOT_FOUND" };
        if (event.type !== "payment.paid") {
          return { status: "REJECTED", code: "UNSUPPORTED_EVENT" };
        }
        if (event.livemode !== input.expectedLivemode) {
          return { status: "REJECTED", code: "MODE_MISMATCH" };
        }
        if (!event.externalCheckoutId) {
          return { status: "REJECTED", code: "CHECKOUT_MISMATCH" };
        }
        if (!event.externalPaymentId) {
          return { status: "REJECTED", code: "PAYMENT_REFERENCE_MISSING" };
        }

        const attempt = await repository.findCheckoutAttempt(event.provider, event.externalCheckoutId);
        if (!attempt || attempt.status !== "PENDING" || attempt.externalCheckoutId !== event.externalCheckoutId) {
          return { status: "REJECTED", code: "CHECKOUT_MISMATCH" };
        }
        if (!event.reference || event.reference !== attempt.commercialReference) {
          return { status: "REJECTED", code: "REFERENCE_MISMATCH" };
        }
        if (event.amountMinor === null || event.amountMinor !== attempt.amountMinor) {
          return { status: "REJECTED", code: "AMOUNT_MISMATCH" };
        }
        if (!event.currency || event.currency.toUpperCase() !== attempt.currency.toUpperCase()) {
          return { status: "REJECTED", code: "CURRENCY_MISMATCH" };
        }

        const claim: PaymentsSettlementFactClaim = {
          id: randomUUID(),
          providerEventRecordId: event.id,
          checkoutAttemptId: attempt.id,
          provider: event.provider,
          eventId: event.eventId,
          externalPaymentId: event.externalPaymentId,
          externalCheckoutId: event.externalCheckoutId,
          commercialReference: attempt.commercialReference,
          amountMinor: attempt.amountMinor,
          currency: attempt.currency.toUpperCase(),
          livemode: event.livemode,
          settledAt: event.occurredAt,
        };

        const result = await repository.claim(claim);
        if (!result.created && !equivalent(result.record, claim)) {
          return { status: "REJECTED", code: "SETTLEMENT_CONFLICT" };
        }
        return {
          status: "SETTLED",
          disposition: result.created ? "CREATED" : "EXISTING",
          value: result.record,
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
