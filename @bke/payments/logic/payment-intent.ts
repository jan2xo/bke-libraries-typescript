import type {
  PaymentsPaymentIntentCapability,
  PaymentsCreatePaymentIntentInput,
  PaymentsPaymentIntentSnapshot,
  PaymentsPaymentIntentStatus,
  PaymentsPaymentIntentContinuation,
} from "../contracts/payment-intent.contract";
import type {
  PaymentsPaymentIntentAttemptRecord,
  PaymentsPaymentIntentAttemptRepository,
} from "./payment-intent-repository";
import type { PaymentsPaymentIntentProvider } from "./payment-intent-provider";
import { PaymentsPaymentIntentProviderError } from "./payment-intent-provider";

const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
const CREATE_LEASE_MS = 30_000;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalized(input: PaymentsCreatePaymentIntentInput): PaymentsCreatePaymentIntentInput {
  return {
    sourceReference: input.sourceReference.trim(),
    commercialReference: input.commercialReference.trim(),
    amountMinor: input.amountMinor,
    currency: input.currency.trim().toUpperCase(),
    livemode: input.livemode,
    paymentMethodAllowed: [...new Set(input.paymentMethodAllowed.map((value) => value.trim().toLowerCase()))].sort(),
  };
}

function valid(input: PaymentsCreatePaymentIntentInput): boolean {
  return Boolean(
    input &&
      typeof input.sourceReference === "string" &&
      input.sourceReference.trim().length > 0 &&
      input.sourceReference.trim().length <= 300 &&
      typeof input.commercialReference === "string" &&
      input.commercialReference.trim().length > 0 &&
      input.commercialReference.trim().length <= 300 &&
      Number.isSafeInteger(input.amountMinor) &&
      input.amountMinor > 0 &&
      typeof input.currency === "string" &&
      /^[A-Z]{3}$/i.test(input.currency.trim()) &&
      typeof input.livemode === "boolean" &&
      Array.isArray(input.paymentMethodAllowed) &&
      input.paymentMethodAllowed.length > 0 &&
      input.paymentMethodAllowed.length <= 10 &&
      input.paymentMethodAllowed.every(
        (value) => typeof value === "string" && /^[a-z][a-z0-9_]{1,31}$/i.test(value.trim()),
      ),
  );
}

function matches(
  record: PaymentsPaymentIntentAttemptRecord,
  intent: Awaited<ReturnType<PaymentsPaymentIntentProvider["retrievePaymentIntent"]>>,
): boolean {
  return (
    intent.paymentIntentId === record.paymentIntentId &&
    intent.amountMinor === record.amountMinor &&
    intent.currency.toUpperCase() === record.currency.toUpperCase() &&
    intent.livemode === record.livemode
  );
}

function continuation(
  intent: Awaited<ReturnType<PaymentsPaymentIntentProvider["retrievePaymentIntent"]>>,
): PaymentsPaymentIntentContinuation {
  return Object.freeze({
    paymentIntentId: intent.paymentIntentId,
    status: intent.status,
    ...(intent.qrImageUrl ? { qrImageUrl: intent.qrImageUrl } : {}),
    ...(intent.redirectUrl ? { redirectUrl: intent.redirectUrl } : {}),
    ...(intent.expiresAt ? { expiresAt: intent.expiresAt } : {}),
  });
}

function snapshot(
  record: PaymentsPaymentIntentAttemptRecord,
  intent: Awaited<ReturnType<PaymentsPaymentIntentProvider["retrievePaymentIntent"]>>,
): PaymentsPaymentIntentSnapshot | null {
  if (!record.paymentIntentId || !intent.clientKey || record.status.toLowerCase() !== intent.status) return null;
  return Object.freeze({
    attemptId: record.id,
    sourceReference: record.sourceReference,
    provider: record.provider,
    paymentIntentId: record.paymentIntentId,
    clientKey: intent.clientKey,
    status: intent.status,
    ...(intent.qrImageUrl ? { qrImageUrl: intent.qrImageUrl } : {}),
    ...(intent.redirectUrl ? { redirectUrl: intent.redirectUrl } : {}),
    ...(intent.expiresAt ? { expiresAt: intent.expiresAt } : {}),
    amountMinor: record.amountMinor,
    currency: record.currency,
    livemode: record.livemode,
    createdAt: new Date(record.createdAt),
  });
}

function providerFailure(error: unknown): "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED" {
  return error instanceof PaymentsPaymentIntentProviderError ? error.code : "PROVIDER_UNAVAILABLE";
}

export function createPaymentsPaymentIntentCapability(
  repository: PaymentsPaymentIntentAttemptRepository,
  provider: PaymentsPaymentIntentProvider,
  options: {
    readonly now?: () => Date;
    readonly leaseMilliseconds?: number;
    readonly creationEnabled?: boolean;
  } = {},
): PaymentsPaymentIntentCapability {
  const providerName = provider.name.trim().toLowerCase();
  const now = options.now ?? (() => new Date());
  const leaseMilliseconds = options.leaseMilliseconds ?? CREATE_LEASE_MS;
  const creationEnabled = options.creationEnabled ?? true;
  if (!providerName || !Number.isSafeInteger(leaseMilliseconds) || leaseMilliseconds < 1000) {
    throw new Error("PAYMENTS_PAYMENT_INTENT_CONFIGURATION_INVALID");
  }

  return Object.freeze({
    async create(
      input: PaymentsCreatePaymentIntentInput,
    ): ReturnType<PaymentsPaymentIntentCapability["create"]> {
      if (!valid(input)) return { status: "FAILED", code: "INVALID_INPUT" };
      const value = normalized(input);
      if (value.livemode !== provider.livemode) return { status: "FAILED", code: "MODE_MISMATCH" };
      const fingerprint = await sha256(JSON.stringify(value));
      const idempotencyKey =
        "bke_pi_" + (await sha256(providerName + "|" + value.sourceReference + "|" + fingerprint));
      const claimedAt = now();

      let claim;
      try {
        claim = await repository.claim({
          id: crypto.randomUUID(),
          sourceReference: value.sourceReference,
          commercialReference: value.commercialReference,
          provider: providerName,
          requestFingerprint: fingerprint,
          amountMinor: value.amountMinor,
          currency: value.currency,
          paymentMethodAllowed: value.paymentMethodAllowed,
          livemode: value.livemode,
          idempotencyKey,
          idempotencyExpiresAt: new Date(claimedAt.getTime() + IDEMPOTENCY_WINDOW_MS),
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      let record = claim.record;
      if (
        record.provider !== providerName ||
        record.requestFingerprint !== fingerprint ||
        record.amountMinor !== value.amountMinor ||
        record.currency.toUpperCase() !== value.currency ||
        record.livemode !== value.livemode ||
        record.paymentMethodAllowed.join("|") !== value.paymentMethodAllowed.join("|")
      ) {
        return { status: "REJECTED", code: "SOURCE_CONFLICT" };
      }

      // Existing provider resources remain queryable when new Payment Intent creation is disabled.
      if (record.paymentIntentId) {
        try {
          const observedAt = now();
          const intent = await provider.retrievePaymentIntent(record.paymentIntentId);
          if (!matches(record, intent)) return { status: "FAILED", code: "PAYMENT_INTENT_MISMATCH" };
          record = await repository.updateStatus(record.id, intent.status, observedAt);
          const view = snapshot(record, intent);
          return view
            ? { status: "READY", disposition: "EXISTING", value: view }
            : { status: "FAILED", code: "PROVIDER_UNAVAILABLE" };
        } catch (error) {
          return { status: "FAILED", code: providerFailure(error) };
        }
      }

      if (!creationEnabled) return { status: "FAILED", code: "CREATION_DISABLED" };

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
          const observedAt = now();
          const intent = await provider.retrievePaymentIntent(record.paymentIntentId);
          if (!matches(record, intent)) return { status: "FAILED", code: "PAYMENT_INTENT_MISMATCH" };
          record = await repository.updateStatus(record.id, intent.status, observedAt);
          const view = snapshot(record, intent);
          return view
            ? { status: "READY", disposition: "EXISTING", value: view }
            : { status: "FAILED", code: "PROVIDER_UNAVAILABLE" };
        } catch (error) {
          return { status: "FAILED", code: providerFailure(error) };
        }
      }

      const leaseToken = record.createLeaseToken;
      if (!leaseToken) return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      try {
        const observedAt = now();
        const intent = await provider.createPaymentIntent({
          amountMinor: record.amountMinor,
          currency: record.currency,
          paymentMethodAllowed: record.paymentMethodAllowed,
          commercialReference: record.commercialReference,
          sourceReference: record.sourceReference,
          idempotencyKey: record.idempotencyKey,
        });
        if (
          !intent.paymentIntentId.startsWith("pi_") ||
          !intent.clientKey ||
          intent.amountMinor !== record.amountMinor ||
          intent.currency.toUpperCase() !== record.currency.toUpperCase() ||
          intent.livemode !== record.livemode
        ) {
          if (!await repository.markUnknown(record.id, leaseToken)) return { status: "FAILED", code: "REQUEST_IN_PROGRESS" };
          return { status: "FAILED", code: "PAYMENT_INTENT_MISMATCH" };
        }
        record = await repository.bindPaymentIntent(record.id, intent.paymentIntentId, intent.status, leaseToken, observedAt);
        const view = snapshot(record, intent);
        return view
          ? { status: "READY", disposition: claim.created ? "CREATED" : "EXISTING", value: view }
          : { status: "FAILED", code: "PROVIDER_UNAVAILABLE" };
      } catch (error) {
        try {
          if (error instanceof PaymentsPaymentIntentProviderError && error.code === "PROVIDER_REJECTED") {
            if (!await repository.markFailed(record.id, "PROVIDER_REJECTED", leaseToken)) return { status: "FAILED", code: "REQUEST_IN_PROGRESS" };
            return { status: "FAILED", code: "PROVIDER_REJECTED" };
          }
          if (!await repository.markUnknown(record.id, leaseToken)) return { status: "FAILED", code: "REQUEST_IN_PROGRESS" };
        } catch {
          return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
        }
        return { status: "FAILED", code: "PROVIDER_UNAVAILABLE" };
      }
    },

    async createPaymentMethod(
      input: Parameters<PaymentsPaymentIntentCapability["createPaymentMethod"]>[0],
    ): ReturnType<PaymentsPaymentIntentCapability["createPaymentMethod"]> {
      if (!input?.attemptId?.trim() || !input.type?.trim()) return { status: "REJECTED", code: "INVALID_INPUT" };
      const type = input.type.trim().toLowerCase();
      if (input.expirySeconds !== undefined &&
        (!Number.isSafeInteger(input.expirySeconds) || input.expirySeconds < 60 || input.expirySeconds > 9000)) {
        return { status: "REJECTED", code: "INVALID_INPUT" };
      }
      let record: PaymentsPaymentIntentAttemptRecord | null;
      try {
        record = await repository.findById(input.attemptId.trim());
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
      if (
        !record?.paymentIntentId ||
        record.status === "FAILED" ||
        record.status === "CANCELLED" || record.status === "SUCCEEDED" ||
        !record.paymentMethodAllowed.includes(type)
      ) {
        return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
      }
      const paymentIntentId = record.paymentIntentId;
      try {
        const observedAt = now();
        const current = await provider.retrievePaymentIntent(paymentIntentId);
        if (!matches(record, current)) return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
        record = await repository.updateStatus(record.id, current.status, observedAt);
        // QR Ph expiry returns this same Payment Intent to awaiting_payment_method.
        if (record.status !== "AWAITING_PAYMENT_METHOD" || current.status !== "awaiting_payment_method") return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
        const created = await provider.createPaymentMethod({
          type,
          ...(input.expirySeconds === undefined ? {} : { expirySeconds: input.expirySeconds }),
        });
        if (!created.paymentMethodId.startsWith("pm_") || created.type !== type) {
          return { status: "FAILED", code: "PROVIDER_REJECTED" };
        }
        return { status: "CREATED", value: created };
      } catch (error) {
        return { status: "FAILED", code: providerFailure(error) };
      }
    },

    async attachPaymentMethod(
      input: Parameters<PaymentsPaymentIntentCapability["attachPaymentMethod"]>[0],
    ): ReturnType<PaymentsPaymentIntentCapability["attachPaymentMethod"]> {
      if (!input?.attemptId?.trim() || !input.paymentMethodId?.trim() || !input.clientKey?.trim()) {
        return { status: "REJECTED", code: "INVALID_INPUT" };
      }
      let record: PaymentsPaymentIntentAttemptRecord | null;
      try {
        record = await repository.findById(input.attemptId.trim());
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
      if (!record?.paymentIntentId || record.status === "FAILED" || record.status === "CANCELLED" || record.status === "SUCCEEDED") {
        return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
      }
      const paymentIntentId = record.paymentIntentId;
      try {
        const observedAt = now();
        const current = await provider.retrievePaymentIntent(paymentIntentId);
        if (!matches(record, current)) return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
        record = await repository.updateStatus(record.id, current.status, observedAt);
        // Recover a lost attach response by returning the provider's already-created next action.
        if (record.status === "AWAITING_NEXT_ACTION" && current.status === "awaiting_next_action" && (current.qrImageUrl || current.redirectUrl)) {
          return { status: "ATTACHED", value: continuation(current) };
        }
        if (record.status !== "AWAITING_PAYMENT_METHOD" || current.status !== "awaiting_payment_method") {
          return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
        }
        const attachedObservedAt = now();
        const attached = await provider.attachPaymentMethod({
          paymentIntentId,
          paymentMethodId: input.paymentMethodId.trim(),
          clientKey: input.clientKey.trim(),
        });
        if (attached.paymentIntentId !== paymentIntentId) return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
        record = await repository.updateStatus(record.id, attached.status, attachedObservedAt);
        if (record.status.toLowerCase() !== attached.status) return { status: "REJECTED", code: "PAYMENT_INTENT_MISMATCH" };
        return { status: "ATTACHED", value: attached };
      } catch (error) {
        return { status: "FAILED", code: providerFailure(error) };
      }
    },
  });
}
