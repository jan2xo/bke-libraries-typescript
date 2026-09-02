import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PaymentsCheckoutProvider,
  PaymentsProviderCheckoutInput,
  PaymentsProviderCheckoutResult,
} from "../../logic/checkout-attempt-provider";
import { PaymentsProviderError } from "../../logic/checkout-attempt-provider";
import type {
  PaymentsProviderEventVerifier,
  PaymentsVerifiedProviderEvent,
} from "../../logic/provider-event-verifier";
import type {
  PaymentsRefundProvider,
  PaymentsRefundProviderInput,
  PaymentsRefundProviderResult,
} from "../../logic/refund-provider";

const DEFAULT_API_BASE_URL = "https://api.paymongo.com/v1";
const SIGNATURE_MAX_AGE_SECONDS = 300;

type PayMongoResource = {
  readonly id: string;
  readonly type?: string;
  readonly attributes: Record<string, unknown>;
};

type PayMongoEvent = {
  readonly data: {
    readonly id: string;
    readonly attributes: {
      readonly type: string;
      readonly livemode: boolean;
      readonly created_at: number;
      readonly data: PayMongoResource;
    };
  };
};

export interface PayMongoAdapterConfiguration {
  readonly secretKey: string;
  readonly webhookSecret: string;
  readonly livemode: boolean;
  readonly successUrl: (input: PaymentsProviderCheckoutInput) => string;
  readonly cancelUrl: (input: PaymentsProviderCheckoutInput) => string;
  readonly paymentMethodTypes?: readonly string[];
  readonly apiBaseUrl?: string;
  readonly request?: typeof fetch;
  readonly now?: () => Date;
}

export type PayMongoPaymentsAdapter = PaymentsCheckoutProvider &
  PaymentsProviderEventVerifier &
  PaymentsRefundProvider;

function assertConfiguration(config: PayMongoAdapterConfiguration) {
  const secretKey = config.secretKey.trim();
  const webhookSecret = config.webhookSecret.trim();
  if (!secretKey || !webhookSecret) throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
  if (!config.livemode && !secretKey.startsWith("sk_test_")) {
    throw new Error("PAYMENT_PROVIDER_UNSAFE_CONFIGURATION");
  }
  if (config.livemode && !secretKey.startsWith("sk_live_")) {
    throw new Error("PAYMENT_PROVIDER_UNSAFE_CONFIGURATION");
  }
  const methods = config.paymentMethodTypes?.map((value) => value.trim()).filter(Boolean) ?? ["qrph"];
  if (methods.length === 0) throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
  return {
    secretKey,
    webhookSecret,
    methods,
    baseUrl: (config.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/, ""),
    request: config.request ?? fetch,
    now: config.now ?? (() => new Date()),
  };
}

function authorization(secretKey: string) {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

function headerValue(headers: Readonly<Record<string, string>>, name: string) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return "";
}

function parseSignatureHeader(value: string) {
  const entries = value
    .split(",")
    .map((part) => part.split("=", 2).map((item) => item.trim()))
    .filter((entry): entry is [string, string] => entry.length === 2 && Boolean(entry[0]) && Boolean(entry[1]));
  return Object.fromEntries(entries);
}

function secureEqualHex(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function normalizeEvent(event: PayMongoEvent): PaymentsVerifiedProviderEvent {
  const resource = event.data.attributes.data;
  const attrs = resource.attributes;
  const rawType = event.data.attributes.type;
  const type: PaymentsVerifiedProviderEvent["type"] =
    rawType === "payment.paid" || rawType === "checkout_session.payment.paid"
      ? "payment.paid"
      : rawType === "payment.failed" || rawType === "checkout_session.payment.failed"
        ? "payment.failed"
        : rawType === "payment.refunded"
          ? "payment.refunded"
          : rawType === "payment.refund.updated"
            ? "payment.refund.updated"
            : "unknown";

  const payments = Array.isArray(attrs.payments) ? (attrs.payments as PayMongoResource[]) : [];
  const nestedPayment = payments[0];
  const paymentAttrs = nestedPayment?.attributes ?? attrs;
  const isRefund = resource.type === "refund";
  const rawRefundStatus = isRefund ? String(attrs.status ?? "pending") : undefined;
  const refundStatus =
    rawRefundStatus === "succeeded" || rawRefundStatus === "success"
      ? "succeeded"
      : rawRefundStatus === "failed"
        ? "failed"
        : rawRefundStatus
          ? "pending"
          : undefined;

  return Object.freeze({
    eventId: event.data.id,
    rawType,
    type,
    ...(nestedPayment?.id || resource.type === "payment" || typeof attrs.payment_id === "string"
      ? {
          externalPaymentId:
            nestedPayment?.id ??
            (resource.type === "payment" ? resource.id : (attrs.payment_id as string | undefined)),
        }
      : {}),
    ...(resource.type === "checkout_session" || typeof attrs.checkout_session_id === "string"
      ? {
          externalCheckoutId:
            resource.type === "checkout_session"
              ? resource.id
              : (attrs.checkout_session_id as string),
        }
      : {}),
    ...(isRefund ? { externalRefundId: resource.id } : {}),
    ...(refundStatus ? { refundStatus } : {}),
    ...(typeof attrs.reference_number === "string" || typeof paymentAttrs.external_reference_number === "string"
      ? {
          reference:
            (attrs.reference_number as string | undefined) ??
            (paymentAttrs.external_reference_number as string),
        }
      : {}),
    ...(typeof paymentAttrs.amount === "number" ? { amountMinor: paymentAttrs.amount } : {}),
    ...(typeof paymentAttrs.currency === "string" ? { currency: paymentAttrs.currency } : {}),
    livemode: event.data.attributes.livemode,
    occurredAt: new Date(event.data.attributes.created_at * 1000),
  });
}

export function createPayMongoPaymentsAdapter(
  configuration: PayMongoAdapterConfiguration,
): PayMongoPaymentsAdapter {
  const config = assertConfiguration(configuration);
  const auth = authorization(config.secretKey);

  return Object.freeze({
    name: "paymongo",

    async createCheckout(
      input: PaymentsProviderCheckoutInput,
    ): Promise<PaymentsProviderCheckoutResult> {
      const response = await config.request(`${config.baseUrl}/checkout_sessions`, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              billing: { name: input.payer.name, email: input.payer.email },
              line_items: input.items.map((item) => ({
                name: item.name,
                description: item.description,
                amount: item.amountMinor,
                currency: input.currency,
                quantity: item.quantity,
              })),
              payment_method_types: config.methods,
              reference_number: input.commercialReference,
              success_url: configuration.successUrl(input),
              cancel_url: configuration.cancelUrl(input),
              send_email_receipt: false,
              show_line_items: true,
            },
          },
        }),
      });

      if (!response.ok) throw new PaymentsProviderError("PROVIDER_UNAVAILABLE");
      const body = (await response.json()) as {
        data?: { id?: string; attributes?: { checkout_url?: string } };
      };
      const externalCheckoutId = body.data?.id?.trim() ?? "";
      const checkoutUrl = body.data?.attributes?.checkout_url?.trim() ?? "";
      if (!externalCheckoutId || !checkoutUrl) {
        throw new PaymentsProviderError("PROVIDER_REJECTED");
      }
      return { externalCheckoutId, checkoutUrl };
    },

    async verifyAndParse(
      rawBody: Uint8Array,
      headers: Readonly<Record<string, string>>,
    ): Promise<PaymentsVerifiedProviderEvent> {
      const parts = parseSignatureHeader(headerValue(headers, "paymongo-signature"));
      const timestamp = Number(parts.t);
      const signature = configuration.livemode ? parts.li : parts.te;
      if (!timestamp || !signature) throw new Error("PAYMENT_SIGNATURE_INVALID");
      const nowSeconds = config.now().getTime() / 1000;
      if (Math.abs(nowSeconds - timestamp) > SIGNATURE_MAX_AGE_SECONDS) {
        throw new Error("PAYMENT_SIGNATURE_STALE");
      }
      const rawText = Buffer.from(rawBody).toString("utf8");
      const expected = createHmac("sha256", config.webhookSecret)
        .update(`${timestamp}.${rawText}`)
        .digest("hex");
      if (!secureEqualHex(signature, expected)) throw new Error("PAYMENT_SIGNATURE_INVALID");

      let parsed: PayMongoEvent;
      try {
        parsed = JSON.parse(rawText) as PayMongoEvent;
      } catch {
        throw new Error("PAYMENT_EVENT_INVALID");
      }
      if (!parsed?.data?.id || !parsed.data.attributes?.type || !parsed.data.attributes.data) {
        throw new Error("PAYMENT_EVENT_INVALID");
      }
      return normalizeEvent(parsed);
    },

    async createRefund(input: PaymentsRefundProviderInput): Promise<PaymentsRefundProviderResult> {
      const response = await config.request(`${config.baseUrl}/refunds`, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              amount: input.amountMinor,
              payment_id: input.externalPaymentId,
              reason: input.reason,
              notes: input.notes?.slice(0, 240),
            },
          },
        }),
      });

      if (!response.ok) {
        if (response.status === 409 || response.status === 422) {
          throw new Error("PAYMENT_REFUND_NOT_ALLOWED");
        }
        throw new Error("PAYMENT_PROVIDER_UNAVAILABLE");
      }

      const body = (await response.json()) as {
        data?: {
          id?: string;
          attributes?: { status?: string; amount?: number; payment_id?: string };
        };
      };
      const externalRefundId = body.data?.id?.trim() ?? "";
      const attributes = body.data?.attributes;
      if (
        !externalRefundId ||
        typeof attributes?.amount !== "number" ||
        !attributes.payment_id
      ) {
        throw new Error("PAYMENT_PROVIDER_UNAVAILABLE");
      }
      const status =
        attributes.status === "succeeded" || attributes.status === "success"
          ? "succeeded"
          : attributes.status === "failed"
            ? "failed"
            : "pending";
      return {
        externalRefundId,
        status,
        amountMinor: attributes.amount,
        externalPaymentId: attributes.payment_id,
      };
    },
  });
}
