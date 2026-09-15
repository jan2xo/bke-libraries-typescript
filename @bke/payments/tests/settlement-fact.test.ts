import { describe, expect, it } from "vitest";
import { createPaymentsSettlementFactCapability } from "../logic/settlement-fact";
import type { PaymentsCheckoutAttemptState } from "../logic/checkout-attempt-repository";
import type { PaymentsSettlementFactRepository } from "../logic/settlement-fact-repository";

type SettlementOverrides = Partial<{
  type: string;
  livemode: boolean;
  checkout: string | null;
  reference: string | null;
  payment: string | null;
  amount: number | null;
  currency: string | null;
  attemptStatus: PaymentsCheckoutAttemptState;
  eventRowId: string;
  eventId: string;
  occurredAt: Date;
}>;

type FactStore = { fact: any | null };

function repo(overrides: SettlementOverrides = {}, store: FactStore = { fact: null }): PaymentsSettlementFactRepository {
  const event = {
    id: overrides.eventRowId ?? "event-row", provider: "fakepay", eventId: overrides.eventId ?? "evt_paid", payloadHash: "h", eventFingerprint: "f",
    rawType: "payment.paid", type: (overrides.type ?? "payment.paid") as any,
    externalPaymentId: overrides.payment === undefined ? "pay_1" : overrides.payment,
    externalCheckoutId: overrides.checkout === undefined ? "co_1" : overrides.checkout,
    reference: overrides.reference === undefined ? "ORDER-1" : overrides.reference,
    externalRefundId: null, refundStatus: null,
    amountMinor: overrides.amount === undefined ? 1000 : overrides.amount,
    currency: overrides.currency === undefined ? "PHP" : overrides.currency,
    livemode: overrides.livemode ?? false,
    occurredAt: overrides.occurredAt ?? new Date("2026-09-02T00:00:00Z"), receivedAt: new Date("2026-09-02T00:00:01Z"),
  };
  return {
    async findProviderEventById(id) { return id === event.id ? event : null; },
    async findCheckoutAttempt(provider, checkout) {
      if (provider !== "fakepay" || checkout !== "co_1") return null;
      return { id: "attempt-1", sourceReference: "src-1", commercialReference: "ORDER-1", provider: "fakepay", requestFingerprint: "rf", amountMinor: 1000, currency: "PHP", payerSnapshot: {}, itemsSnapshot: [], status: overrides.attemptStatus ?? "PENDING", externalCheckoutId: "co_1", checkoutUrl: "https://example.test", failureCode: null, createdAt: new Date(), updatedAt: new Date() };
    },
    async claim(input) {
      if (!store.fact) store.fact = { settlementFactId: input.id, ...input, createdAt: new Date("2026-09-02T00:00:02Z") };
      return { created: store.fact.settlementFactId === input.id, record: store.fact };
    },
  };
}

describe("Payments settlement fact", () => {
  it("creates then reuses a reconciled settlement fact", async () => {
    const capability = createPaymentsSettlementFactCapability(repo());
    const first = await capability.reconcile({ providerEventRecordId: "event-row", expectedLivemode: false });
    const second = await capability.reconcile({ providerEventRecordId: "event-row", expectedLivemode: false });
    expect(first.status).toBe("SETTLED");
    expect(second.status).toBe("SETTLED");
  });

  it("reuses one settlement for a distinct overlapping paid event with the same commercial facts", async () => {
    const store: FactStore = { fact: null };
    const first = await createPaymentsSettlementFactCapability(repo({}, store)).reconcile({
      providerEventRecordId: "event-row",
      expectedLivemode: false,
    });
    const overlap = await createPaymentsSettlementFactCapability(repo({
      eventRowId: "event-row-overlap",
      eventId: "evt_paid_overlap",
      occurredAt: new Date("2026-09-02T00:00:05Z"),
    }, store)).reconcile({
      providerEventRecordId: "event-row-overlap",
      expectedLivemode: false,
    });
    expect(first.status === "SETTLED" && first.disposition).toBe("CREATED");
    expect(overlap.status === "SETTLED" && overlap.disposition).toBe("EXISTING");
    expect(overlap.status === "SETTLED" && overlap.value.providerEventRecordId).toBe("event-row");
  });

  it("accepts a provider settlement for a checkout attempt cancelled locally after provider checkout creation", async () => {
    const result = await createPaymentsSettlementFactCapability(repo({ attemptStatus: "CANCELLED" })).reconcile({
      providerEventRecordId: "event-row",
      expectedLivemode: false,
    });
    expect(result.status).toBe("SETTLED");
  });

  it.each(["CREATING", "FAILED"] as const)("rejects non-settleable checkout attempt state %s", async (attemptStatus) => {
    const result = await createPaymentsSettlementFactCapability(repo({ attemptStatus })).reconcile({
      providerEventRecordId: "event-row",
      expectedLivemode: false,
    });
    expect(result).toEqual({ status: "REJECTED", code: "CHECKOUT_MISMATCH" });
  });

  it.each([
    [{ livemode: true }, "MODE_MISMATCH"],
    [{ checkout: "wrong" }, "CHECKOUT_MISMATCH"],
    [{ reference: "ORDER-X" }, "REFERENCE_MISMATCH"],
    [{ amount: 999 }, "AMOUNT_MISMATCH"],
    [{ currency: "USD" }, "CURRENCY_MISMATCH"],
    [{ payment: null }, "PAYMENT_REFERENCE_MISSING"],
    [{ type: "payment.failed" }, "UNSUPPORTED_EVENT"],
  ] as const)("rejects mismatch %s", async (overrides, code) => {
    const result = await createPaymentsSettlementFactCapability(repo(overrides as any)).reconcile({ providerEventRecordId: "event-row", expectedLivemode: false });
    expect(result).toEqual({ status: "REJECTED", code });
  });
});
