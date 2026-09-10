import { describe, expect, it } from "vitest";
import { createPaymentsReconciliationCapability } from "../logic/reconciliation";
import type { PaymentsReconciliationProvider } from "../logic/reconciliation-provider";
import type {
  PaymentsReconciliationRecordInput,
  PaymentsReconciliationRepository,
} from "../logic/reconciliation-repository";
import type { PaymentsReconciliationSnapshot } from "../contracts/reconciliation.contract";
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

function repository() {
  const records = new Map<string, PaymentsReconciliationSnapshot>();
  const repo: PaymentsReconciliationRepository = {
    async findLatestSettlementFactByCommercialReference(reference) {
      return reference === settlement.commercialReference ? settlement : null;
    },
    async create(input: PaymentsReconciliationRecordInput) {
      const now = new Date("2026-09-02T00:00:02Z");
      const record: PaymentsReconciliationSnapshot = Object.freeze({
        reconciliationId: input.id,
        commercialReference: input.commercialReference,
        settlementFactId: input.settlementFactId,
        provider: input.provider,
        externalPaymentId: input.externalPaymentId,
        classification: input.classification,
        differences: Object.freeze([...input.differences]),
        localStatus: input.localStatus,
        providerStatus: input.providerStatus,
        state: input.state,
        correlationId: input.correlationId,
        runById: input.runById,
        acknowledgedAt: null,
        acknowledgedById: null,
        lastErrorCode: input.lastErrorCode,
        createdAt: now,
        updatedAt: now,
      });
      records.set(record.reconciliationId, record);
      return record;
    },
    async acknowledge(id, actorId) {
      const current = records.get(id);
      if (!current) return null;
      const updated: PaymentsReconciliationSnapshot = Object.freeze({
        ...current,
        state: "ACKNOWLEDGED",
        acknowledgedAt: new Date("2026-09-02T00:01:00Z"),
        acknowledgedById: actorId,
        updatedAt: new Date("2026-09-02T00:01:00Z"),
      });
      records.set(id, updated);
      return updated;
    },
  };
  return { repo, records };
}

function provider(overrides: Partial<Awaited<ReturnType<PaymentsReconciliationProvider["retrievePayment"]>>> = {}): PaymentsReconciliationProvider {
  return {
    name: "fakepay",
    async retrievePayment() {
      return {
        externalPaymentId: "pay-1",
        amountMinor: 300_000,
        currency: "PHP",
        status: "paid",
        livemode: false,
        ...overrides,
      };
    },
  };
}

describe("Payments reconciliation", () => {
  it("records an exact provider match", async () => {
    const { repo } = repository();
    const result = await createPaymentsReconciliationCapability(repo, provider()).run({ commercialReference: "ORDER-1", runById: "admin-1" });
    expect(result.status).toBe("RECONCILED");
    expect(result.status === "RECONCILED" && result.value.classification).toBe("MATCHED");
    expect(result.status === "RECONCILED" && result.value.state).toBe("MATCHED");
  });

  it("classifies amount mismatch and keeps it open", async () => {
    const { repo } = repository();
    const result = await createPaymentsReconciliationCapability(repo, provider({ amountMinor: 299_999 })).run({ commercialReference: "ORDER-1", runById: "admin-1" });
    expect(result.status === "RECONCILED" && result.value.classification).toBe("AMOUNT_MISMATCH");
    expect(result.status === "RECONCILED" && result.value.differences).toContain("amount");
    expect(result.status === "RECONCILED" && result.value.state).toBe("OPEN");
  });

  it("persists provider-unavailable evidence and fails closed", async () => {
    const { repo, records } = repository();
    const unavailable: PaymentsReconciliationProvider = { name: "fakepay", async retrievePayment() { throw new Error("down"); } };
    const result = await createPaymentsReconciliationCapability(repo, unavailable).run({ commercialReference: "ORDER-1", runById: "admin-1" });
    expect(result).toEqual({ status: "FAILED", code: "PROVIDER_UNAVAILABLE" });
    expect([...records.values()][0]?.classification).toBe("PROVIDER_UNAVAILABLE");
  });

  it("acknowledges a durable reconciliation record", async () => {
    const { repo } = repository();
    const capability = createPaymentsReconciliationCapability(repo, provider({ status: "failed" }));
    const run = await capability.run({ commercialReference: "ORDER-1", runById: "admin-1" });
    expect(run.status).toBe("RECONCILED");
    if (run.status !== "RECONCILED") throw new Error("expected reconciliation");
    const acknowledged = await capability.acknowledge({ reconciliationId: run.value.reconciliationId, actorId: "admin-2" });
    expect(acknowledged.status).toBe("ACKNOWLEDGED");
    expect(acknowledged.status === "ACKNOWLEDGED" && acknowledged.value.acknowledgedById).toBe("admin-2");
  });

  it("fails closed when no settlement exists", async () => {
    const { repo } = repository();
    await expect(createPaymentsReconciliationCapability(repo, provider()).run({ commercialReference: "missing", runById: "admin-1" }))
      .resolves.toEqual({ status: "REJECTED", code: "SETTLEMENT_NOT_FOUND" });
  });
});
