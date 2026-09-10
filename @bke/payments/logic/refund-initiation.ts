import { createHash, randomUUID } from "node:crypto";
import type {
  PaymentsInitiateFullRefundByCommercialReferenceInput,
  PaymentsInitiateRefundInput,
  PaymentsInitiateRefundResult,
  PaymentsRefundInitiationCapability,
  PaymentsRefundReason,
} from "../contracts/refund-initiation.contract";
import type { PaymentsSettlementFactSnapshot } from "../contracts/settlement-fact.contract";
import type { PaymentsRefundProvider } from "./refund-provider";
import type { PaymentsRefundRepository } from "./refund-repository";

const REFUND_REASONS = new Set([
  "requested_by_customer",
  "duplicate",
  "fraudulent",
  "other",
]);

type NormalizedRefundRequest = {
  readonly sourceReference: string;
  readonly amountMinor: number;
  readonly reason: PaymentsRefundReason;
  readonly notes: string | null;
};

function normalizeCommon(input: {
  readonly sourceReference: string;
  readonly reason: PaymentsRefundReason;
  readonly notes?: string;
}) {
  const sourceReference = input.sourceReference.trim();
  const notes = input.notes?.trim().slice(0, 240) || null;
  if (!sourceReference || !REFUND_REASONS.has(input.reason)) return null;
  return { sourceReference, reason: input.reason, notes };
}

function normalize(input: PaymentsInitiateRefundInput) {
  const common = normalizeCommon(input);
  const settlementFactId = input.settlementFactId.trim();
  if (
    !common ||
    !settlementFactId ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0
  ) {
    return null;
  }
  return {
    ...common,
    settlementFactId,
    amountMinor: input.amountMinor,
  };
}

function normalizeFull(input: PaymentsInitiateFullRefundByCommercialReferenceInput) {
  const common = normalizeCommon(input);
  const commercialReference = input.commercialReference.trim();
  if (!common || !commercialReference) return null;
  return { ...common, commercialReference };
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createPaymentsRefundInitiationCapability(
  repository: PaymentsRefundRepository,
  provider: PaymentsRefundProvider,
): PaymentsRefundInitiationCapability {
  const providerName = provider.name.trim().toLowerCase();
  if (!providerName) throw new Error("Payments refund provider name is required.");

  async function initiateAgainstSettlement(
    request: NormalizedRefundRequest,
    settlement: PaymentsSettlementFactSnapshot,
  ): Promise<PaymentsInitiateRefundResult> {
    if (settlement.provider.trim().toLowerCase() !== providerName) {
      return { status: "REJECTED", code: "REFUND_NOT_ALLOWED" };
    }
    if (request.amountMinor > settlement.amountMinor) {
      return { status: "REJECTED", code: "AMOUNT_EXCEEDS_SETTLEMENT" };
    }

    const requestFingerprint = fingerprint({
      settlementFactId: settlement.settlementFactId,
      amountMinor: request.amountMinor,
      reason: request.reason,
      notes: request.notes,
    });

    const claimed = await repository.claim({
      id: randomUUID(),
      sourceReference: request.sourceReference,
      settlementFactId: settlement.settlementFactId,
      provider: settlement.provider,
      externalPaymentId: settlement.externalPaymentId,
      amountMinor: request.amountMinor,
      currency: settlement.currency,
      reason: request.reason,
      notes: request.notes,
    });

    if (claimed.outcome === "AMOUNT_EXCEEDS_SETTLEMENT") {
      return { status: "REJECTED", code: "AMOUNT_EXCEEDS_SETTLEMENT" };
    }

    const recordWithFingerprint = fingerprint({
      settlementFactId: claimed.record.settlementFactId,
      amountMinor: claimed.record.amountMinor,
      reason: claimed.record.reason,
      notes: claimed.record.notes,
    });
    if (recordWithFingerprint !== requestFingerprint) {
      return { status: "REJECTED", code: "SOURCE_CONFLICT" };
    }

    if (!claimed.created && claimed.record.state !== "CREATING") {
      return {
        status: "REFUND",
        disposition: "EXISTING",
        value: claimed.record,
      };
    }

    try {
      const result = await provider.createRefund({
        externalPaymentId: settlement.externalPaymentId,
        amountMinor: request.amountMinor,
        reason: request.reason,
        notes: request.notes ?? undefined,
        idempotencyKey: claimed.record.refundOperationId,
      });

      if (
        result.externalPaymentId !== settlement.externalPaymentId ||
        result.amountMinor !== request.amountMinor ||
        !result.externalRefundId.trim()
      ) {
        if (result.externalRefundId.trim()) {
          await repository.markProviderResult(
            claimed.record.refundOperationId,
            result.externalRefundId,
            "FAILED",
          );
        } else {
          await repository.markFailed(claimed.record.refundOperationId);
        }
        return { status: "REJECTED", code: "REFUND_NOT_ALLOWED" };
      }

      const state =
        result.status === "succeeded"
          ? "SUCCEEDED"
          : result.status === "failed"
            ? "FAILED"
            : "PENDING";
      const updated = await repository.markProviderResult(
        claimed.record.refundOperationId,
        result.externalRefundId,
        state,
      );
      return {
        status: "REFUND",
        disposition: claimed.created ? "CREATED" : "EXISTING",
        value: updated,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "PAYMENT_REFUND_NOT_ALLOWED") {
        await repository.markFailed(claimed.record.refundOperationId);
        return { status: "REJECTED", code: "REFUND_NOT_ALLOWED" };
      }
      // Keep CREATING reserved after transient provider failure. A retry reuses
      // the same durable refund-operation ID as the provider idempotency key.
      return { status: "FAILED", code: "PROVIDER_UNAVAILABLE" };
    }
  }

  return Object.freeze({
    async initiate(input: PaymentsInitiateRefundInput): Promise<PaymentsInitiateRefundResult> {
      const normalized = normalize(input);
      if (!normalized) return { status: "FAILED", code: "INVALID_INPUT" };

      try {
        const settlement = await repository.findSettlementFact(normalized.settlementFactId);
        if (!settlement) return { status: "REJECTED", code: "SETTLEMENT_NOT_FOUND" };
        return await initiateAgainstSettlement(normalized, settlement);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },

    async initiateFullByCommercialReference(
      input: PaymentsInitiateFullRefundByCommercialReferenceInput,
    ): Promise<PaymentsInitiateRefundResult> {
      const normalized = normalizeFull(input);
      if (!normalized) return { status: "FAILED", code: "INVALID_INPUT" };

      try {
        const settlement = await repository.findLatestSettlementFactByCommercialReference(
          normalized.commercialReference,
        );
        if (!settlement) return { status: "REJECTED", code: "SETTLEMENT_NOT_FOUND" };
        return await initiateAgainstSettlement(
          {
            sourceReference: normalized.sourceReference,
            amountMinor: settlement.amountMinor,
            reason: normalized.reason,
            notes: normalized.notes,
          },
          settlement,
        );
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
