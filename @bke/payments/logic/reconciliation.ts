import { randomUUID } from "node:crypto";
import type {
  PaymentsAcknowledgeReconciliationResult,
  PaymentsReconciliationCapability,
  PaymentsReconciliationClassification,
  PaymentsRetrievedPayment,
  PaymentsRunReconciliationResult,
} from "../contracts/reconciliation.contract";
import type { PaymentsSettlementFactSnapshot } from "../contracts/settlement-fact.contract";
import type { PaymentsReconciliationProvider } from "./reconciliation-provider";
import type { PaymentsReconciliationRepository } from "./reconciliation-repository";

function classify(local: PaymentsSettlementFactSnapshot, remote: PaymentsRetrievedPayment) {
  const differences: string[] = [];
  if (remote.externalPaymentId !== local.externalPaymentId) differences.push("external_id");
  if (remote.amountMinor !== local.amountMinor) differences.push("amount");
  if (remote.currency.toUpperCase() !== local.currency.toUpperCase()) differences.push("currency");
  if (remote.livemode !== local.livemode) differences.push("mode");
  if (remote.status !== "paid") differences.push("status");
  const classification: PaymentsReconciliationClassification = differences.includes("amount")
    ? "AMOUNT_MISMATCH"
    : differences.includes("currency")
      ? "CURRENCY_MISMATCH"
      : differences.includes("mode")
        ? "MODE_MISMATCH"
        : differences.length === 0
          ? "MATCHED"
          : "STATUS_MISMATCH";
  return { differences, classification };
}

export function createPaymentsReconciliationCapability(
  repository: PaymentsReconciliationRepository,
  provider: PaymentsReconciliationProvider,
): PaymentsReconciliationCapability {
  const providerName = provider.name.trim().toLowerCase();
  if (!providerName) throw new Error("Payments reconciliation provider name is required.");

  return Object.freeze({
    async run(input): Promise<PaymentsRunReconciliationResult> {
      const commercialReference = input.commercialReference.trim();
      const runById = input.runById.trim();
      if (!commercialReference || !runById) return { status: "FAILED", code: "INVALID_INPUT" };

      let settlement: PaymentsSettlementFactSnapshot | null;
      try {
        settlement = await repository.findLatestSettlementFactByCommercialReference(commercialReference);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
      if (!settlement || settlement.provider.trim().toLowerCase() !== providerName) {
        return { status: "REJECTED", code: "SETTLEMENT_NOT_FOUND" };
      }

      const correlationId = `reconcile:${randomUUID()}`;
      try {
        const remote = await provider.retrievePayment(settlement.externalPaymentId);
        const result = classify(settlement, remote);
        const value = await repository.create({
          id: randomUUID(),
          commercialReference,
          settlementFactId: settlement.settlementFactId,
          provider: settlement.provider,
          externalPaymentId: settlement.externalPaymentId,
          classification: result.classification,
          differences: result.differences,
          localStatus: "PAID",
          providerStatus: remote.status,
          state: result.differences.length === 0 ? "MATCHED" : "OPEN",
          correlationId,
          runById,
          lastErrorCode: null,
        });
        return { status: "RECONCILED", value };
      } catch (error) {
        try {
          await repository.create({
            id: randomUUID(),
            commercialReference,
            settlementFactId: settlement.settlementFactId,
            provider: settlement.provider,
            externalPaymentId: settlement.externalPaymentId,
            classification: "PROVIDER_UNAVAILABLE",
            differences: [],
            localStatus: "PAID",
            providerStatus: null,
            state: "OPEN",
            correlationId,
            runById,
            lastErrorCode: "PAYMENT_PROVIDER_UNAVAILABLE",
          });
        } catch {
          return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
        }
        return { status: "FAILED", code: "PROVIDER_UNAVAILABLE" };
      }
    },

    async acknowledge(input): Promise<PaymentsAcknowledgeReconciliationResult> {
      const reconciliationId = input.reconciliationId.trim();
      const actorId = input.actorId.trim();
      if (!reconciliationId || !actorId) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const value = await repository.acknowledge(reconciliationId, actorId);
        return value
          ? { status: "ACKNOWLEDGED", value }
          : { status: "REJECTED", code: "RECONCILIATION_NOT_FOUND" };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
