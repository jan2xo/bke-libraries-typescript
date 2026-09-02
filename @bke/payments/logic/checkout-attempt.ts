import { createHash, randomUUID } from "node:crypto";
import type {
  PaymentsCheckoutAttemptCapability,
  PaymentsCheckoutAttemptSnapshot,
  PaymentsCheckoutLineItemInput,
  PaymentsCheckoutPayerInput,
  PaymentsCreateCheckoutAttemptInput,
  PaymentsCreateCheckoutAttemptResult,
} from "../contracts/checkout-attempt.contract";
import type { PaymentsCheckoutAttemptRepository } from "./checkout-attempt-repository";
import {
  PaymentsProviderError,
  type PaymentsCheckoutProvider,
} from "./checkout-attempt-provider";

interface NormalizedCheckoutInput {
  readonly sourceReference: string;
  readonly commercialReference: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly payer: PaymentsCheckoutPayerInput;
  readonly items: readonly PaymentsCheckoutLineItemInput[];
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function normalize(input: PaymentsCreateCheckoutAttemptInput): NormalizedCheckoutInput | null {
  const sourceReference = input.sourceReference.trim();
  const commercialReference = input.commercialReference.trim();
  const currency = input.currency.trim().toUpperCase();
  const payerName = input.payer.name.trim();
  const payerEmail = input.payer.email.trim().toLowerCase();

  if (!sourceReference || sourceReference.length > 200) return null;
  if (!commercialReference || commercialReference.length > 200) return null;
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) return null;
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  if (!payerName || payerName.length > 200) return null;
  if (!payerEmail || payerEmail.length > 320 || !payerEmail.includes("@")) return null;
  if (input.items.length === 0 || input.items.length > 100) return null;

  const items: PaymentsCheckoutLineItemInput[] = [];
  let computedTotal = 0;
  for (const item of input.items) {
    const name = item.name.trim();
    const description = item.description?.trim();
    if (!name || name.length > 200) return null;
    if (description && description.length > 500) return null;
    if (!Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0) return null;
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > 10_000) return null;
    computedTotal += item.amountMinor * item.quantity;
    if (!Number.isSafeInteger(computedTotal)) return null;
    items.push(Object.freeze({
      name,
      ...(description ? { description } : {}),
      amountMinor: item.amountMinor,
      quantity: item.quantity,
    }));
  }
  if (computedTotal !== input.amountMinor) return null;

  return Object.freeze({
    sourceReference,
    commercialReference,
    amountMinor: input.amountMinor,
    currency,
    payer: Object.freeze({ name: payerName, email: payerEmail }),
    items: Object.freeze(items),
  });
}

function snapshot(record: {
  id: string;
  sourceReference: string;
  provider: string;
  status: string;
  externalCheckoutId: string | null;
  checkoutUrl: string | null;
  amountMinor: number;
  currency: string;
  createdAt: Date;
}): PaymentsCheckoutAttemptSnapshot | null {
  if (
    record.status !== "PENDING" ||
    !record.externalCheckoutId ||
    !record.checkoutUrl
  ) {
    return null;
  }
  return Object.freeze({
    attemptId: record.id,
    sourceReference: record.sourceReference,
    provider: record.provider,
    status: "PENDING",
    externalCheckoutId: record.externalCheckoutId,
    checkoutUrl: record.checkoutUrl,
    amountMinor: record.amountMinor,
    currency: record.currency,
    createdAt: new Date(record.createdAt),
  });
}

export function createPaymentsCheckoutAttemptCapability(
  repository: PaymentsCheckoutAttemptRepository,
  provider: PaymentsCheckoutProvider,
): PaymentsCheckoutAttemptCapability {
  const providerName = provider.name.trim().toLowerCase();
  if (!providerName) throw new Error("PAYMENTS_PROVIDER_NAME_REQUIRED");

  return Object.freeze({
    async create(input: PaymentsCreateCheckoutAttemptInput): Promise<PaymentsCreateCheckoutAttemptResult> {
      const normalized = normalize(input);
      if (!normalized) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const requestFingerprint = fingerprint({
        provider: providerName,
        ...normalized,
      });

      let claim;
      try {
        claim = await repository.claim({
          id: randomUUID(),
          sourceReference: normalized.sourceReference,
          commercialReference: normalized.commercialReference,
          provider: providerName,
          requestFingerprint,
          amountMinor: normalized.amountMinor,
          currency: normalized.currency,
          payerSnapshot: normalized.payer,
          itemsSnapshot: normalized.items,
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (claim.record.requestFingerprint !== requestFingerprint) {
        return { status: "REJECTED", code: "SOURCE_CONFLICT" };
      }

      const existing = snapshot(claim.record);
      if (existing) {
        return {
          status: "READY",
          disposition: "EXISTING",
          value: existing,
        };
      }

      try {
        const checkout = await provider.createCheckout({
          attemptId: claim.record.id,
          sourceReference: normalized.sourceReference,
          commercialReference: normalized.commercialReference,
          amountMinor: normalized.amountMinor,
          currency: normalized.currency,
          payer: normalized.payer,
          items: normalized.items,
          idempotencyKey: claim.record.id,
        });
        if (!checkout.externalCheckoutId.trim() || !checkout.checkoutUrl.trim()) {
          throw new PaymentsProviderError("PROVIDER_REJECTED");
        }
        const pending = await repository.markPending(
          claim.record.id,
          checkout.externalCheckoutId.trim(),
          checkout.checkoutUrl.trim(),
        );
        const value = snapshot(pending);
        if (!value) {
          return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
        }
        return {
          status: "READY",
          disposition: claim.created ? "CREATED" : "EXISTING",
          value,
        };
      } catch (error) {
        const code = error instanceof PaymentsProviderError
          ? error.code
          : "PROVIDER_UNAVAILABLE";
        try {
          await repository.markFailed(claim.record.id, code);
        } catch {
          return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
        }
        return { status: "FAILED", code };
      }
    },
  });
}
