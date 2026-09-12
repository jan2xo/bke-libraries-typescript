import { describe, expect, it } from "vitest";
import type {
  PaymentsCommercialEventMatchEvent,
  PaymentsCommercialOrderFact,
} from "../contracts/commercial-event-match.contract";
import { matchPaymentsCommercialEvent } from "../logic/commercial-event-match";

const order = (overrides: Partial<PaymentsCommercialOrderFact> = {}): PaymentsCommercialOrderFact => ({
  orderId: "order-1",
  commercialReference: "BKE-1001",
  amountMinor: 300_000,
  currency: "PHP",
  ...overrides,
});

const event = (overrides: Partial<PaymentsCommercialEventMatchEvent> = {}): PaymentsCommercialEventMatchEvent => ({
  type: "payment.paid",
  externalCheckoutId: "checkout-1",
  reference: "BKE-1001",
  amountMinor: 300_000,
  currency: "PHP",
  ...overrides,
});

describe("Payments commercial provider-event matching", () => {
  it("uses checkout-attempt order first when all facts agree", () => {
    const fact = order();
    expect(matchPaymentsCommercialEvent({
      event: event(),
      attemptOrder: fact,
      referenceOrder: fact,
      knownPaymentOrder: null,
    })).toEqual({ status: "MATCHED", order: fact, matchedBy: "CHECKOUT" });
  });

  it("allows known-payment fallback when checkout lookup is absent", () => {
    const fact = order();
    expect(matchPaymentsCommercialEvent({
      event: event(),
      attemptOrder: null,
      referenceOrder: null,
      knownPaymentOrder: fact,
    })).toEqual({ status: "MATCHED", order: fact, matchedBy: "KNOWN_PAYMENT" });
  });

  it("rejects an external checkout with neither attempt nor known payment", () => {
    expect(matchPaymentsCommercialEvent({
      event: event(),
      attemptOrder: null,
      referenceOrder: order(),
      knownPaymentOrder: null,
    })).toEqual({ status: "REJECTED", code: "PAYMENT_CHECKOUT_MISMATCH" });
  });

  it("rejects checkout and reference orders that disagree", () => {
    expect(matchPaymentsCommercialEvent({
      event: event(),
      attemptOrder: order(),
      referenceOrder: order({ orderId: "order-2" }),
      knownPaymentOrder: null,
    })).toEqual({ status: "REJECTED", code: "PAYMENT_CHECKOUT_MISMATCH" });
  });

  it("rejects when no commercial order can be resolved", () => {
    expect(matchPaymentsCommercialEvent({
      event: event({ externalCheckoutId: null }),
      attemptOrder: null,
      referenceOrder: null,
      knownPaymentOrder: null,
    })).toEqual({ status: "REJECTED", code: "PAYMENT_REFERENCE_MISMATCH" });
  });

  it("rejects a known payment bound to a different order", () => {
    expect(matchPaymentsCommercialEvent({
      event: event(),
      attemptOrder: order(),
      referenceOrder: null,
      knownPaymentOrder: order({ orderId: "order-2" }),
    })).toEqual({ status: "REJECTED", code: "PAYMENT_REFERENCE_MISMATCH" });
  });

  it("rejects an explicit provider reference that differs from the order", () => {
    expect(matchPaymentsCommercialEvent({
      event: event({ reference: "BKE-WRONG" }),
      attemptOrder: order(),
      referenceOrder: null,
      knownPaymentOrder: null,
    })).toEqual({ status: "REJECTED", code: "PAYMENT_REFERENCE_MISMATCH" });
  });

  it("rejects amount mismatch including a missing amount", () => {
    expect(matchPaymentsCommercialEvent({
      event: event({ amountMinor: 299_999 }),
      attemptOrder: order(),
      referenceOrder: null,
      knownPaymentOrder: null,
    })).toEqual({ status: "REJECTED", code: "PAYMENT_AMOUNT_MISMATCH" });
    expect(matchPaymentsCommercialEvent({
      event: event({ amountMinor: null }),
      attemptOrder: order(),
      referenceOrder: null,
      knownPaymentOrder: null,
    })).toEqual({ status: "REJECTED", code: "PAYMENT_AMOUNT_MISMATCH" });
  });

  it("matches currency case-insensitively and rejects a different currency", () => {
    const fact = order();
    expect(matchPaymentsCommercialEvent({
      event: event({ currency: "php" }),
      attemptOrder: fact,
      referenceOrder: null,
      knownPaymentOrder: null,
    })).toEqual({ status: "MATCHED", order: fact, matchedBy: "CHECKOUT" });
    expect(matchPaymentsCommercialEvent({
      event: event({ currency: "USD" }),
      attemptOrder: fact,
      referenceOrder: null,
      knownPaymentOrder: null,
    })).toEqual({ status: "REJECTED", code: "PAYMENT_CURRENCY_MISMATCH" });
  });

  it("rejects missing currency for paid and failed events", () => {
    for (const type of ["payment.paid", "payment.failed"] as const) {
      expect(matchPaymentsCommercialEvent({
        event: event({ type, currency: null }),
        attemptOrder: order(),
        referenceOrder: null,
        knownPaymentOrder: null,
      })).toEqual({ status: "REJECTED", code: "PAYMENT_CURRENCY_MISMATCH" });
    }
  });

  it("allows missing currency for refund updates only when a known payment exists", () => {
    const fact = order();
    expect(matchPaymentsCommercialEvent({
      event: event({ type: "payment.refund.updated", currency: null }),
      attemptOrder: fact,
      referenceOrder: null,
      knownPaymentOrder: fact,
    })).toEqual({ status: "MATCHED", order: fact, matchedBy: "CHECKOUT" });
    expect(matchPaymentsCommercialEvent({
      event: event({ type: "payment.refund.updated", currency: null, externalCheckoutId: null }),
      attemptOrder: null,
      referenceOrder: fact,
      knownPaymentOrder: null,
    })).toEqual({ status: "REJECTED", code: "PAYMENT_CURRENCY_MISMATCH" });
  });

  it("uses reference order when no checkout or known-payment order is present", () => {
    const fact = order();
    expect(matchPaymentsCommercialEvent({
      event: event({ externalCheckoutId: null }),
      attemptOrder: null,
      referenceOrder: fact,
      knownPaymentOrder: null,
    })).toEqual({ status: "MATCHED", order: fact, matchedBy: "REFERENCE" });
  });
});
