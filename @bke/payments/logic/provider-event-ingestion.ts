import { createHash, randomUUID } from "node:crypto";
import type {
  PaymentsIngestProviderEventInput,
  PaymentsIngestProviderEventResult,
  PaymentsProviderEventIngestionCapability,
  PaymentsVerifiedProviderEventSnapshot,
} from "../contracts/provider-event-ingestion.contract";
import type { PaymentsProviderEventRepository } from "./provider-event-repository";
import type {
  PaymentsProviderEventVerifier,
  PaymentsVerifiedProviderEvent,
} from "./provider-event-verifier";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string | undefined, max: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > max) return undefined;
  return normalized;
}

function normalizeVerifiedEvent(event: PaymentsVerifiedProviderEvent): PaymentsVerifiedProviderEvent | null {
  const eventId = normalizeText(event.eventId, 300);
  if (!eventId) return null;
  if (!(event.occurredAt instanceof Date) || !Number.isFinite(event.occurredAt.getTime())) return null;
  const allowedTypes = new Set([
    "payment.paid",
    "payment.failed",
    "payment.refunded",
    "payment.refund.updated",
    "unknown",
  ]);
  if (!allowedTypes.has(event.type)) return null;

  const amountMinor = event.amountMinor;
  if (amountMinor !== undefined && (!Number.isSafeInteger(amountMinor) || amountMinor < 0)) return null;
  const currency = event.currency?.trim().toUpperCase();
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) return null;

  return Object.freeze({
    eventId,
    ...(normalizeText(event.rawType, 300) ? { rawType: normalizeText(event.rawType, 300) } : {}),
    type: event.type,
    ...(normalizeText(event.externalPaymentId, 300) ? { externalPaymentId: normalizeText(event.externalPaymentId, 300) } : {}),
    ...(normalizeText(event.externalCheckoutId, 300) ? { externalCheckoutId: normalizeText(event.externalCheckoutId, 300) } : {}),
    ...(normalizeText(event.reference, 300) ? { reference: normalizeText(event.reference, 300) } : {}),
    ...(normalizeText(event.externalRefundId, 300) ? { externalRefundId: normalizeText(event.externalRefundId, 300) } : {}),
    ...(event.refundStatus ? { refundStatus: event.refundStatus } : {}),
    ...(amountMinor !== undefined ? { amountMinor } : {}),
    ...(currency !== undefined ? { currency } : {}),
    livemode: event.livemode,
    occurredAt: new Date(event.occurredAt),
  });
}

function snapshot(record: Awaited<ReturnType<PaymentsProviderEventRepository["claim"]>>["record"]): PaymentsVerifiedProviderEventSnapshot {
  return Object.freeze({
    providerEventRecordId: record.id,
    provider: record.provider,
    eventId: record.eventId,
    ...(record.rawType ? { rawType: record.rawType } : {}),
    type: record.type,
    ...(record.externalPaymentId ? { externalPaymentId: record.externalPaymentId } : {}),
    ...(record.externalCheckoutId ? { externalCheckoutId: record.externalCheckoutId } : {}),
    ...(record.reference ? { reference: record.reference } : {}),
    ...(record.externalRefundId ? { externalRefundId: record.externalRefundId } : {}),
    ...(record.refundStatus ? { refundStatus: record.refundStatus } : {}),
    ...(record.amountMinor !== null ? { amountMinor: record.amountMinor } : {}),
    ...(record.currency ? { currency: record.currency } : {}),
    livemode: record.livemode,
    occurredAt: new Date(record.occurredAt),
    receivedAt: new Date(record.receivedAt),
  });
}

export function createPaymentsProviderEventIngestionCapability(
  repository: PaymentsProviderEventRepository,
  verifier: PaymentsProviderEventVerifier,
): PaymentsProviderEventIngestionCapability {
  const provider = verifier.name.trim().toLowerCase();
  if (!provider) throw new Error("PAYMENTS_EVENT_VERIFIER_NAME_REQUIRED");

  return Object.freeze({
    async ingest(input: PaymentsIngestProviderEventInput): Promise<PaymentsIngestProviderEventResult> {
      if (!(input.rawBody instanceof Uint8Array) || input.rawBody.byteLength === 0) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let verified: PaymentsVerifiedProviderEvent;
      try {
        verified = await verifier.verifyAndParse(input.rawBody, input.headers);
      } catch {
        return { status: "FAILED", code: "VERIFICATION_FAILED" };
      }

      const normalized = normalizeVerifiedEvent(verified);
      if (!normalized) return { status: "FAILED", code: "INVALID_INPUT" };

      const payloadHash = sha256(input.rawBody);
      const eventFingerprint = sha256(canonicalJson({ provider, ...normalized, occurredAt: normalized.occurredAt.toISOString() }));

      let claim;
      try {
        claim = await repository.claim({
          id: randomUUID(),
          provider,
          eventId: normalized.eventId,
          payloadHash,
          eventFingerprint,
          rawType: normalized.rawType ?? null,
          type: normalized.type,
          externalPaymentId: normalized.externalPaymentId ?? null,
          externalCheckoutId: normalized.externalCheckoutId ?? null,
          reference: normalized.reference ?? null,
          externalRefundId: normalized.externalRefundId ?? null,
          refundStatus: normalized.refundStatus ?? null,
          amountMinor: normalized.amountMinor ?? null,
          currency: normalized.currency ?? null,
          livemode: normalized.livemode,
          occurredAt: normalized.occurredAt,
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (
        claim.record.payloadHash !== payloadHash ||
        claim.record.eventFingerprint !== eventFingerprint
      ) {
        return { status: "REJECTED", code: "EVENT_CONFLICT" };
      }

      return {
        status: "VERIFIED",
        disposition: claim.created ? "CREATED" : "EXISTING",
        value: snapshot(claim.record),
      };
    },
  });
}
