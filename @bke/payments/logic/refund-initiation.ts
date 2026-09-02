import { createHash, randomUUID } from "node:crypto";
import type {
  PaymentsInitiateRefundInput,
  PaymentsInitiateRefundResult,
  PaymentsRefundInitiationCapability,
} from "../contracts/refund-initiation.contract";
import type { PaymentsRefundProvider } from "./refund-provider";
import type { PaymentsRefundRepository } from "./refund-repository";

const REFUND_REASONS = new Set([
  "requested_by_customer",
  "duplicate",
  "fraudulent",
  "other",
]);

function normalize(input: PaymentsInitiateRefundInput) {
  const sourceReference = input.sourceReference.trim();
  const settlementFactId = input.settlementFactId.trim();
  const notes = input.notes?.trim().slice(0, 240) || null;
  if (
    !sourceReference ||
    !settlementFactId ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0 ||
    !REFUND_REASONS.has(input.reason)
  ) {
    return null;
  }
  return {
    sourceReference,
    settlementFactId,
    amountMinor: input.amountMinor,
    reason: input.reason,
    notes,
  };
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

  return Object.freeze({
    async initiate(input: PaymentsInitiateRefundInput): Promise<PaymentsInitiateRefundResult> {
      const normalized = normalize(input);
      if (!normalized) return { status: "FAILED", code: "INVALID_INPUT" };

      try {
        const settlement = await repository.findSettlementFact(normalized.settlementFactId);
        if (!settlement) return { status: "REJECTED", code: "SETTLEMENT_NOT_FOUND" };
        if (settlement.provider.trim().toLowerCase() !== providerName) {
          return { status: "REJECTED", code: "REFUND_NOT_ALLOWED" };
        }
        if (normalized.amountMinor > settlement.amountMinor) {
          return { status: "REJECTED", code: "AMOUNT_EXCEEDS_SETTLEMENT" };
        }

        const requestFingerprint = fingerprint({
          settlementFactId: normalized.settlementFactId,
          amountMinor: normalized.amountMinor,
          reason: normalized.reason,
          notes: normalized.notes,
        });

        const claimed = await repository.claim({
          id: randomUUID(),
          sourceReference: normalized.sourceReference,
          settlementFactId: settlement.settlementFactId,
          provider: settlement.provider,
          externalPaymentId: settlement.externalPaymentId,
          amountMinor: normalized.amountMinor,
          currency: settlement.currency,
          reason: normalized.reason,
          notes: normalized.notes,
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
            amountMinor: normalized.amountMinor,
            reason: normalized.reason,
            notes: normalized.notes ?? undefined,
            idempotencyKey: claimed.record.refundOperationId,
          });

          if (
            result.externalPaymentId !== settlement.externalPaymentId ||
            result.amountMinor !== normalized.amountMinor ||
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
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
