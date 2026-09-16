import { describe, expect, it } from "vitest";
import type {
  PaymentsCommercialEventMatchEvent,
  PaymentsCommercialOrderFact,
} from "../contracts/commercial-event-match.contract";
import {
  matchPaymentsCommercialEvent,
  validatePaymentsProviderEventMode,
} from "../logic/commercial-event-match";

const order = (overrides: Partial<PaymentsCommercialOrderFact> = {}): PaymentsCommercialOrderFact => ({
  orderId: "order-1",
  commercialReference: "BKE-1001",
  amountMinor: 300_000,
  currency: "PHP",
  ...overrides,
});

const event = (overrides: Partial<PaymentsCommercialEventMatchEvent> = {}): PaymentsCommercialEventMatchEvent => ({
  type: "payment.paid",
  livemode: false,
  externalCheckoutId: "checkout-1",
  externalPaymentId: "payment-1",
  reference: "BKE-1001",
  amountMinor: 300_000,
  currency: "PHP",
  ...overrides,
});

const match = (
  overrides: Partial<Parameters<typeof matchPaymentsCommercialEvent>[0]> = {},
) => matchPaymentsCommercialEvent({
  event: event(),
  expectedLivemode: false,
  attemptOrder: order(),
  referenceOrder: null,
  knownPaymentOrder: null,
  ...overrides,
});

describe("Payments provider event commercial policy", () => {
  it("validates provider mode independently so unknown events can be gated first", () => {
    expect(validatePaymentsProviderEventMode({ eventLivemode: false, expectedLivemode: false }))
      .toEqual({ status: "MATCHED" });
    expect(validatePaymentsProviderEventMode({ eventLivemode: true, expectedLivemode: false }))
      .toEqual({ status: "REJECTED", code: "PAYMENT_MODE_MISMATCH" });
  });

  it("rejects mode mismatch before commercial resolution", () => {
    expect(match({
      event: event({ livemode: true }),
      attemptOrder: null,
      referenceOrder: null,
      knownPaymentOrder: null,
    })).toEqual({ status: "REJECTED", code: "PAYMENT_MODE_MISMATCH" });
  });

  it("uses checkout-attempt order first when facts agree", () => {
    const fact = order();
    expect(match({ attemptOrder: fact, referenceOrder: fact }))
      .toEqual({ status: "MATCHED", order: fact, matchedBy: "CHECKOUT" });
  });

  it("allows known-payment fallback when checkout lookup is absent", () => {
    const fact = order();
    expect(match({
      event: event({ externalCheckoutId: null }),
      attemptOrder: null,
      referenceOrder: null,
      knownPaymentOrder: fact,
    })).toEqual({ status: "MATCHED", order: fact, matchedBy: "KNOWN_PAYMENT" });
  });

  it("rejects an external checkout with neither attempt nor known payment", () => {
    expect(match({ attemptOrder: null, referenceOrder: order() }))
      .toEqual({ status: "REJECTED", code: "PAYMENT_CHECKOUT_MISMATCH" });
  });

  it("rejects checkout and reference orders that disagree", () => {
    expect(match({ referenceOrder: order({ orderId: "order-2" }) }))
      .toEqual({ status: "REJECTED", code: "PAYMENT_CHECKOUT_MISMATCH" });
  });

  it("rejects when no commercial order can be resolved", () => {
    expect(match({
      event: event({ externalCheckoutId: null }),
      attemptOrder: null,
      referenceOrder: null,
      knownPaymentOrder: null,
    })).toEqual({ status: "REJECTED", code: "PAYMENT_REFERENCE_MISMATCH" });
  });

  it("rejects a known payment bound to a different order", () => {
    expect(match({ knownPaymentOrder: order({ orderId: "order-2" }) }))
      .toEqual({ status: "REJECTED", code: "PAYMENT_REFERENCE_MISMATCH" });
  });

  it("rejects an explicit provider reference that differs from the order", () => {
    expect(match({ event: event({ reference: "BKE-WRONG" }) }))
      .toEqual({ status: "REJECTED", code: "PAYMENT_REFERENCE_MISMATCH" });
  });

  it("rejects amount mismatch including missing amount", () => {
    expect(match({ event: event({ amountMinor: 299_999 }) }))
      .toEqual({ status: "REJECTED", code: "PAYMENT_AMOUNT_MISMATCH" });
    expect(match({ event: event({ amountMinor: null }) }))
      .toEqual({ status: "REJECTED", code: "PAYMENT_AMOUNT_MISMATCH" });
  });

  it("matches currency case-insensitively and rejects a different currency", () => {
    const fact = order();
    expect(match({ event: event({ currency: "php" }), attemptOrder: fact }))
      .toEqual({ status: "MATCHED", order: fact, matchedBy: "CHECKOUT" });
    expect(match({ event: event({ currency: "USD" }), attemptOrder: fact }))
      .toEqual({ status: "REJECTED", code: "PAYMENT_CURRENCY_MISMATCH" });
  });

  it("requires currency for paid, failed, and legacy refunded events", () => {
    for (const type of ["payment.paid", "payment.failed", "payment.refunded"] as const) {
      expect(match({ event: event({ type, currency: null }) }))
        .toEqual({ status: "REJECTED", code: "PAYMENT_CURRENCY_MISMATCH" });
    }
  });

  it("allows missing currency for refund updates only when a known payment anchors the order", () => {
    const fact = order();
    expect(match({
      event: event({ type: "payment.refund.updated", currency: null }),
      attemptOrder: fact,
      knownPaymentOrder: fact,
    })).toEqual({ status: "MATCHED", order: fact, matchedBy: "CHECKOUT" });

    expect(match({
      event: event({ type: "payment.refund.updated", currency: null, externalCheckoutId: null }),
      attemptOrder: null,
      referenceOrder: fact,
      knownPaymentOrder: null,
    })).toEqual({ status: "REJECTED", code: "PAYMENT_CURRENCY_MISMATCH" });
  });

  it("accepts legacy payment.refunded when normal commercial facts match", () => {
    const fact = order();
    expect(match({ event: event({ type: "payment.refunded" }), attemptOrder: fact }))
      .toEqual({ status: "MATCHED", order: fact, matchedBy: "CHECKOUT" });
  });

  it("uses reference order when no checkout or known-payment order is present", () => {
    const fact = order();
    expect(match({
      event: event({ externalCheckoutId: null }),
      attemptOrder: null,
      referenceOrder: fact,
    })).toEqual({ status: "MATCHED", order: fact, matchedBy: "REFERENCE" });
  });

  it("rejects a paid event without provider payment identity only after commercial facts match", () => {
    expect(match({ event: event({ externalPaymentId: null }) }))
      .toEqual({ status: "REJECTED", code: "PAYMENT_REFERENCE_MISMATCH" });
    expect(match({ event: event({ externalPaymentId: null, amountMinor: 1 }) }))
      .toEqual({ status: "REJECTED", code: "PAYMENT_AMOUNT_MISMATCH" });
  });
});
