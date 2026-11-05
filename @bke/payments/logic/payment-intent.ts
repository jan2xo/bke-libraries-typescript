import { createHash, randomUUID } from "node:crypto";
import type { PaymentsPaymentIntentCapability, PaymentsCreatePaymentIntentInput, PaymentsPaymentIntentSnapshot } from "../contracts/payment-intent.contract";
import type { PaymentsPaymentIntentAttemptRecord, PaymentsPaymentIntentAttemptRepository } from "./payment-intent-repository";
import type { PaymentsPaymentIntentProvider } from "./payment-intent-provider";
import { PaymentsPaymentIntentProviderError } from "./payment-intent-provider";
const KEY_WINDOW_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 30_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function normalized(input: PaymentsCreatePaymentIntentInput): PaymentsCreatePaymentIntentInput {
  return {
    sourceReference: input.sourceReference.trim(),
    commercialReference: input.commercialReference.trim(),
    amountMinor: input.amountMinor,
    currency: input.currency.trim().toUpperCase(),
    paymentMethodAllowed: [...new Set(input.paymentMethodAllowed.map((x) => x.trim().toLowerCase()))].sort(),
  };
}
function valid(input: PaymentsCreatePaymentIntentInput): boolean {
  return Boolean(input && typeof input.sourceReference === "string" && input.sourceReference.trim().length > 0 &&
    input.sourceReference.trim().length <= 300 && typeof input.commercialReference === "string" &&
    input.commercialReference.trim().length > 0 && input.commercialReference.trim().length <= 300 &&
    Number.isSafeInteger(input.amountMinor) && input.amountMinor > 0 &&
    typeof input.currency === "string" && /^[A-Z]{3}$/i.test(input.currency.trim()) &&
    Array.isArray(input.paymentMethodAllowed) && input.paymentMethodAllowed.length > 0 &&
    input.paymentMethodAllowed.length <= 10 &&
    input.paymentMethodAllowed.every((x) => typeof x === "string" && /^[a-z][a-z0-9_]{1,31}$/i.test(x.trim())));
}
function snapshot(record: PaymentsPaymentIntentAttemptRecord, intent: Awaited<ReturnType<PaymentsPaymentIntentProvider["retrievePaymentIntent"]>>): PaymentsPaymentIntentSnapshot | null {
  if (!record.paymentIntentId || !intent.clientKey) return null;
  return Object.freeze({
    attemptId: record.id, sourceReference: record.sourceReference, provider: record.provider,
    paymentIntentId: record.paymentIntentId, clientKey: intent.clientKey, status: intent.status,
    amountMinor: record.amountMinor, currency: record.currency, livemode: record.livemode,
    createdAt: new Date(record.createdAt),
  });
}
function matches(record: PaymentsPaymentIntentAttemptRecord, intent: Awaited<ReturnType<PaymentsPaymentIntentProvider["retrievePaymentIntent"]>>) {
  return intent.paymentIntentId === record.paymentIntentId && intent.amountMinor === record.amountMinor &&
    intent.currency.toUpperCase() === record.currency && intent.livemode === record.livemode;
}
export function createPaymentsPaymentIntentCapability(
  repository: PaymentsPaymentIntentAttemptRepository,
  provider: PaymentsPaymentIntentProvider,
  options: { readonly now?: () => Date; readonly leaseMilliseconds?: number } = {},
): PaymentsPaymentIntentCapability {
  const providerName = provider.name.trim().toLowerCase();
  const now = options.now ?? (() => new Date());
  const leaseMilliseconds = options.leaseMilliseconds ?? LEASE_MS;
  if (!providerName || !Number.isSafeInteger(leaseMilliseconds) || leaseMilliseconds < 1000) throw new Error("PAYMENTS_PAYMENT_INTENT_CONFIGURATION_INVALID");
  return Object.freeze({
    async create(input: PaymentsCreatePaymentIntentInput): ReturnType<PaymentsPaymentIntentCapability["create"]> {
      if (!valid(input)) return { status: "FAILED", code: "INVALID_INPUT" };
      const value = normalized(input);
      const fingerprint = hash(JSON.stringify(value));
      const idempotencyKey = "bke_pi_" + hash(providerName + "|" + value.sourceReference + "|" + fingerprint);
      const createdAt = now();
      let claim;
      try {
        claim = await repository.claim({
          id: randomUUID(), sourceReference: value.sourceReference, commercialReference: value.commercialReference,
          provider: providerName, requestFingerprint: fingerprint, amountMinor: value.amountMinor,
          currency: value.currency, paymentMethodAllowed: value.paymentMethodAllowed, livemode: provider.livemode,
          idempotencyKey, idempotencyExpiresAt: new Date(createdAt.getTime() + KEY_WINDOW_MS),
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
      let record = claim.record;
      if (record.provider !== providerName || record.requestFingerprint !== fingerprint ||
          record.amountMinor !== value.amountMinor || record.currency !== value.currency ||
          record.livemode !== provider.livemode ||
          record.paymentMethodAllowed.join("|") !== value.paymentMethodAllowed.join("|")) {
        return { status: "REJECTED", code: "SOURCE_CONFLICT" };
      }
      if (record.paymentIntentId) {
        try {
          const intent = await provider.retrievePaymentIntent(record.paymentIntentId);
          if (!matches(record, intent)) return { status: "FAILED", code: "PAYMENT_INTENT_MISMATCH" };
          record = await repository.updateStatus(record.id, intent.status);
          const view = snapshot(record, intent);
          return view ? { status: "READY", disposition: "EXISTING", value: view } : { status: "FAILED", code: "PROVIDER_UNAVAILABLE" };
        } catch {
          return { status: "FAILED", code: "PROVIDER_UNAVAILABLE" };
        }
      }
      let lease;
      try {
        lease = await repository.beginCreate(record.id, now(), leaseMilliseconds);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
      record = lease.record;
      if (lease.status === "BUSY") return { status: "FAILED", code: "REQUEST_IN_PROGRESS" };
      if (lease.status === "EXPIRED") return { status: "FAILED", code: "RECOVERY_REQUIRED" };
      if (lease.status === "ALREADY_BOUND" && record.paymentIntentId) {
        try {
          const intent = await provider.retrievePaymentIntent(record.paymentIntentId);
          if (!matches(record, intent)) return { status: "FAILED", code: "PAYMENT_INTENT_MISMATCH" };
          record = await repository.updateStatus(record.id, intent.status);
          const view = snapshot(record, intent);
          return view ? { status: "READY", disposition: "EXISTING", value: view } : { status: "FAILED", code: "PROVIDER_UNAVAILABLE" };
        } catch {
          return { status: "FAILED", code: "PROVIDER_UNAVAILABLE" };
        }
      }
      try {
        const intent = await provider.createPaymentIntent({
          amountMinor: record.amountMinor, currency: record.currency,
          paymentMethodAllowed: record.paymentMethodAllowed, commercialReference: record.commercialReference,
          sourceReference: record.sourceReference, idempotencyKey: record.idempotencyKey,
        });
        if (!intent.paymentIntentId.startsWith("pi_") || !intent.clientKey ||
            intent.amountMinor !== record.amountMinor || intent.currency.toUpperCase() !== record.currency ||
            intent.livemode !== record.livemode) {
          await repository.markUnknown(record.id);
          return { status: "FAILED", code: "PAYMENT_INTENT_MISMATCH" };
        }
        const bound = await repository.bindPaymentIntent(record.id, intent.paymentIntentId, intent.status);
        return {
          status: "READY",
          disposition: claim.created ? "CREATED" : "EXISTING",
          value: {
            attemptId: bound.id, sourceReference: bound.sourceReference, provider: bound.provider,
            paymentIntentId: intent.paymentIntentId, clientKey: intent.clientKey, status: intent.status,
            amountMinor: bound.amountMinor, currency: bound.currency, livemode: bound.livemode,
            createdAt: new Date(bound.createdAt),
          },
        };
      } catch (error) {
        try {
          if (error instanceof PaymentsPaymentIntentProviderError && error.code === "PROVIDER_REJECTED") {
            await repository.markFailed(record.id, "PROVIDER_REJECTED");
            return { status: "FAILED", code: "PROVIDER_REJECTED" };
          }
          await repository.markUnknown(record.id);
        } catch {
          return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
        }
        return { status: "FAILED", code: "PROVIDER_UNAVAILABLE" };
      }
    },
    async createPaymentMethod(input: Parameters<PaymentsPaymentIntentCapability["createPaymentMethod"]>[0]): ReturnType<PaymentsPaymentIntentCapability["createPaymentMethod"]> {
      if (!input?.attemptId?.trim() || !input.type?.trim()) return { status: "REJECTED", code: "INVALID_INPUT" };
      let record;
      try { record = await repository.findById(input.attemptId.trim()); }
      catch { return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" }; }
      const type = input.type.trim().toLowerCase();
      if (!record?.paymentIntentId || record.status === "FAILED" || record.status === "CANCELLED" || !record.paymentMethodAllowed.includes(type)) {
        return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
      }
      try {
        const current = await provider.retrievePaymentIntent(record.paymentIntentId);
        if (!matches(record, current)) return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
        record = await repository.updateStatus(record.id, current.status);
        if (current.status !== "awaiting_payment_method") return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
      } catch {
        return { status: "FAILED", code: "PROVIDER_UNAVAILABLE" };
      }
      if (input.expirySeconds !== undefined && (!Number.isSafeInteger(input.expirySeconds) || input.expirySeconds < 60 || input.expirySeconds > 9000)) {
        return { status: "REJECTED", code: "INVALID_INPUT" };
      }
      try {
        const result = await provider.createPaymentMethod({ type, ...(input.expirySeconds === undefined ? {} : { expirySeconds: input.expirySeconds }) });
        if (!result.paymentMethodId.startsWith("pm_") || result.type !== type) return { status: "FAILED", code: "PROVIDER_REJECTED" };
        return { status: "CREATED", value: result };
      } catch (error) {
        return { status: "FAILED", code: error instanceof PaymentsPaymentIntentProviderError ? error.code : "PROVIDER_UNAVAILABLE" };
      }
    },
    async attachPaymentMethod(input: Parameters<PaymentsPaymentIntentCapability["attachPaymentMethod"]>[0]): ReturnType<PaymentsPaymentIntentCapability["attachPaymentMethod"]> {
      if (!input?.attemptId?.trim() || !input.paymentMethodId?.trim() || !input.clientKey?.trim()) return { status: "REJECTED", code: "INVALID_INPUT" };
      let record;
      try { record = await repository.findById(input.attemptId.trim()); }
      catch { return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" }; }
      if (!record?.paymentIntentId || record.status === "FAILED" || record.status === "CANCELLED") return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
      try {
        const current = await provider.retrievePaymentIntent(record.paymentIntentId);
        if (!matches(record, current) || current.status !== "awaiting_payment_method") return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
        record = await repository.updateStatus(record.id, current.status);
        const result = await provider.attachPaymentMethod({ paymentIntentId: record.paymentIntentId, paymentMethodId: input.paymentMethodId.trim(), clientKey: input.clientKey.trim() });
        if (result.paymentIntentId !== record.paymentIntentId) return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
        await repository.updateStatus(record.id, result.status);
        return { status: "ATTACHED", value: result };
      } catch (error) {
        return { status: "FAILED", code: error instanceof PaymentsPaymentIntentProviderError ? error.code : "PROVIDER_UNAVAILABLE" };
      }
    },
  });
}
