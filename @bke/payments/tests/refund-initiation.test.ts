import { describe, expect, it } from "vitest";
import { createPaymentsRefundInitiationCapability } from "../logic/refund-initiation";
import type { PaymentsRefundProvider } from "../logic/refund-provider";
import type {
  PaymentsRefundOperationClaim,
  PaymentsRefundRepository,
} from "../logic/refund-repository";
import type { PaymentsRefundOperationSnapshot } from "../contracts/refund-initiation.contract";
import type { PaymentsSettlementFactSnapshot } from "../contracts/settlement-fact.contract";

const settlement: PaymentsSettlementFactSnapshot = Object.freeze({
  settlementFactId: "settlement-1",
  providerEventRecordId: "event-row-1",
  checkoutAttemptId: "attempt-1",
  provider: "fakepay",
  eventId: "evt-1",
  externalPaymentId: "pay-1",
  externalCheckoutId: "checkout-1",
  commercialReference: "ORDER-1",
  amountMinor: 300_000,
  currency: "PHP",
  livemode: false,
  settledAt: new Date("2026-09-02T00:00:00Z"),
  createdAt: new Date("2026-09-02T00:00:01Z"),
});

type StoredRefund = PaymentsRefundOperationSnapshot & { readonly notes: string | null };

function repository(): PaymentsRefundRepository {
  const records = new Map<string, StoredRefund>();
  return {
    async findSettlementFact(id) {
      return id === settlement.settlementFactId ? settlement : null;
    },
    async claim(input: PaymentsRefundOperationClaim) {
      const existing = records.get(input.sourceReference);
      if (existing) return { outcome: "CLAIMED", created: false, record: existing };
      const reserved = [...records.values()]
        .filter((record) => record.settlementFactId === input.settlementFactId && ["CREATING", "PENDING", "SUCCEEDED"].includes(record.state))
        .reduce((sum, record) => sum + record.amountMinor, 0);
      if (reserved + input.amountMinor > settlement.amountMinor) {
        return { outcome: "AMOUNT_EXCEEDS_SETTLEMENT" };
      }
      const now = new Date("2026-09-02T00:00:02Z");
      const record: StoredRefund = Object.freeze({
        refundOperationId: input.id,
        sourceReference: input.sourceReference,
        settlementFactId: input.settlementFactId,
        provider: input.provider,
        externalPaymentId: input.externalPaymentId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        reason: input.reason,
        notes: input.notes,
        state: "CREATING",
        createdAt: now,
        updatedAt: now,
      });
      records.set(input.sourceReference, record);
      return { outcome: "CLAIMED", created: true, record };
    },
    async markProviderResult(id, externalRefundId, state) {
      const entry = [...records.entries()].find(([, record]) => record.refundOperationId === id);
      if (!entry) throw new Error("missing refund");
      const [sourceReference, current] = entry;
      const updated: StoredRefund = Object.freeze({
        ...current,
        externalRefundId,
        state,
        updatedAt: new Date("2026-09-02T00:00:03Z"),
      });
      records.set(sourceReference, updated);
      return updated;
    },
    async markFailed(id) {
      const entry = [...records.entries()].find(([, record]) => record.refundOperationId === id);
      if (!entry) throw new Error("missing refund");
      const [sourceReference, current] = entry;
      const updated: StoredRefund = Object.freeze({
        ...current,
        state: "FAILED",
        updatedAt: new Date("2026-09-02T00:00:03Z"),
      });
      records.set(sourceReference, updated);
      return updated;
    },
  };
}

function provider(onCall?: (idempotencyKey: string) => void): PaymentsRefundProvider {
  return {
    name: "fakepay",
    async createRefund(input) {
      onCall?.(input.idempotencyKey);
      return {
        externalRefundId: `refund-${input.idempotencyKey}`,
        status: "pending",
        amountMinor: input.amountMinor,
        externalPaymentId: input.externalPaymentId,
      };
    },
  };
}

describe("Payments refund initiation", () => {
  it("creates one provider refund and returns the durable operation on exact retry", async () => {
    const keys: string[] = [];
    const capability = createPaymentsRefundInitiationCapability(repository(), provider((key) => keys.push(key)));
    const input = {
      sourceReference: "refund-request-1",
      settlementFactId: settlement.settlementFactId,
      amountMinor: 100_000,
      reason: "requested_by_customer" as const,
      notes: "customer request",
    };

    const first = await capability.initiate(input);
    const second = await capability.initiate(input);

    expect(first.status).toBe("REFUND");
    expect(first.status === "REFUND" && first.disposition).toBe("CREATED");
    expect(second.status).toBe("REFUND");
    expect(second.status === "REFUND" && second.disposition).toBe("EXISTING");
    expect(keys).toHaveLength(1);
    expect(first.status === "REFUND" && keys[0]).toBe(first.status === "REFUND" ? first.value.refundOperationId : "");
  });

  it("rejects conflicting reuse of a source reference", async () => {
    const capability = createPaymentsRefundInitiationCapability(repository(), provider());
    await capability.initiate({ sourceReference: "same", settlementFactId: settlement.settlementFactId, amountMinor: 100_000, reason: "other" });
    await expect(capability.initiate({ sourceReference: "same", settlementFactId: settlement.settlementFactId, amountMinor: 90_000, reason: "other" }))
      .resolves.toEqual({ status: "REJECTED", code: "SOURCE_CONFLICT" });
  });

  it("rejects cumulative refund amounts beyond the settlement", async () => {
    const capability = createPaymentsRefundInitiationCapability(repository(), provider());
    const first = await capability.initiate({ sourceReference: "part-a", settlementFactId: settlement.settlementFactId, amountMinor: 200_000, reason: "other" });
    expect(first.status).toBe("REFUND");
    await expect(capability.initiate({ sourceReference: "part-b", settlementFactId: settlement.settlementFactId, amountMinor: 150_000, reason: "other" }))
      .resolves.toEqual({ status: "REJECTED", code: "AMOUNT_EXCEEDS_SETTLEMENT" });
  });

  it("fails closed for missing settlement and provider mismatch", async () => {
    const capability = createPaymentsRefundInitiationCapability(repository(), provider());
    await expect(capability.initiate({ sourceReference: "missing", settlementFactId: "none", amountMinor: 1, reason: "other" }))
      .resolves.toEqual({ status: "REJECTED", code: "SETTLEMENT_NOT_FOUND" });
    const wrongProvider = createPaymentsRefundInitiationCapability(repository(), { ...provider(), name: "otherpay" });
    await expect(wrongProvider.initiate({ sourceReference: "wrong-provider", settlementFactId: settlement.settlementFactId, amountMinor: 1, reason: "other" }))
      .resolves.toEqual({ status: "REJECTED", code: "REFUND_NOT_ALLOWED" });
  });

  it("retries transient provider failure with the same durable idempotency key", async () => {
    const keys: string[] = [];
    let calls = 0;
    const transient: PaymentsRefundProvider = {
      name: "fakepay",
      async createRefund(input) {
        keys.push(input.idempotencyKey);
        calls += 1;
        if (calls === 1) throw new Error("temporary outage");
        return { externalRefundId: "refund-retry", status: "pending", amountMinor: input.amountMinor, externalPaymentId: input.externalPaymentId };
      },
    };
    const capability = createPaymentsRefundInitiationCapability(repository(), transient);
    const input = { sourceReference: "retry", settlementFactId: settlement.settlementFactId, amountMinor: 50_000, reason: "other" as const };
    expect(await capability.initiate(input)).toEqual({ status: "FAILED", code: "PROVIDER_UNAVAILABLE" });
    const retry = await capability.initiate(input);
    expect(retry.status).toBe("REFUND");
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});
