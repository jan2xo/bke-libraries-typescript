import type {
  PaymentsCommercialEventMatchCapability,
  PaymentsCommercialEventMatchInput,
  PaymentsCommercialEventMatchResult,
  PaymentsCommercialOrderFact,
} from "../contracts/commercial-event-match.contract";

function sameOrder(left: PaymentsCommercialOrderFact, right: PaymentsCommercialOrderFact): boolean {
  return left.orderId === right.orderId;
}

export function matchPaymentsCommercialEvent(
  input: PaymentsCommercialEventMatchInput,
): PaymentsCommercialEventMatchResult {
  const { event, attemptOrder, referenceOrder, knownPaymentOrder } = input;

  if (event.externalCheckoutId && !attemptOrder && !knownPaymentOrder) {
    return { status: "REJECTED", code: "PAYMENT_CHECKOUT_MISMATCH" };
  }

  if (attemptOrder && referenceOrder && !sameOrder(attemptOrder, referenceOrder)) {
    return { status: "REJECTED", code: "PAYMENT_CHECKOUT_MISMATCH" };
  }

  const selected = attemptOrder
    ? { order: attemptOrder, matchedBy: "CHECKOUT" as const }
    : referenceOrder
      ? { order: referenceOrder, matchedBy: "REFERENCE" as const }
      : knownPaymentOrder
        ? { order: knownPaymentOrder, matchedBy: "KNOWN_PAYMENT" as const }
        : null;

  if (!selected) {
    return { status: "REJECTED", code: "PAYMENT_REFERENCE_MISMATCH" };
  }

  if (knownPaymentOrder && !sameOrder(knownPaymentOrder, selected.order)) {
    return { status: "REJECTED", code: "PAYMENT_REFERENCE_MISMATCH" };
  }

  if (event.reference && event.reference !== selected.order.commercialReference) {
    return { status: "REJECTED", code: "PAYMENT_REFERENCE_MISMATCH" };
  }

  if (event.amountMinor !== selected.order.amountMinor) {
    return { status: "REJECTED", code: "PAYMENT_AMOUNT_MISMATCH" };
  }

  if (event.currency) {
    if (event.currency.toUpperCase() !== selected.order.currency.toUpperCase()) {
      return { status: "REJECTED", code: "PAYMENT_CURRENCY_MISMATCH" };
    }
  } else if (event.type !== "payment.refund.updated" || !knownPaymentOrder) {
    return { status: "REJECTED", code: "PAYMENT_CURRENCY_MISMATCH" };
  }

  return { status: "MATCHED", ...selected };
}

export function createPaymentsCommercialEventMatchCapability(): PaymentsCommercialEventMatchCapability {
  return Object.freeze({ match: matchPaymentsCommercialEvent });
}
