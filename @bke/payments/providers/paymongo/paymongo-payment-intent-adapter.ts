import type { PaymentsPaymentIntentStatus, PaymentsPaymentIntentContinuation } from "../../contracts/payment-intent.contract";
import type { PaymentsPaymentIntentProvider, PaymentsProviderCreatePaymentIntentInput, PaymentsProviderPaymentIntent } from "../../logic/payment-intent-provider";
import { PaymentsPaymentIntentProviderError } from "../../logic/payment-intent-provider";
const BASE = "https://orders-api.paymongo.com/v1";
type Obj = Record<string, unknown>;
type ResponseBody = { data?: { id?: string; attributes?: Obj } };
export interface PayMongoPaymentIntentAdapterConfiguration {
  readonly secretKey: string;
  readonly publicKey: string;
  readonly livemode: boolean;
  readonly paymentMethodTypes: readonly string[];
  readonly apiBaseUrl?: string;
  readonly request?: typeof fetch;
}
const basic = (key: string) => "Basic " + btoa(key + ":");
function status(value: unknown): PaymentsPaymentIntentStatus {
  if (value === "awaiting_payment_method" || value === "awaiting_next_action" || value === "processing" || value === "succeeded" || value === "cancelled") return value;
  throw new PaymentsPaymentIntentProviderError("PROVIDER_REJECTED", "PAYMENT_INTENT_STATUS_INVALID");
}
function obj(value: unknown): Obj { return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {}; }
function parse(body: ResponseBody): PaymentsProviderPaymentIntent {
  const id = body.data?.id?.trim() ?? "";
  const a = body.data?.attributes ?? {};
  if (!id.startsWith("pi_") || !Number.isSafeInteger(a.amount) || typeof a.currency !== "string" || typeof a.livemode !== "boolean") {
    throw new PaymentsPaymentIntentProviderError("PROVIDER_REJECTED", "PAYMENT_INTENT_RESPONSE_INVALID");
  }
  return Object.freeze({ paymentIntentId: id, ...(typeof a.client_key === "string" && a.client_key ? { clientKey: a.client_key } : {}),
    status: status(a.status), amountMinor: a.amount as number, currency: a.currency.toUpperCase(), livemode: a.livemode });
}
export function createPayMongoPaymentIntentAdapter(config: PayMongoPaymentIntentAdapterConfiguration): PaymentsPaymentIntentProvider {
  const sk = config.secretKey.trim(), pk = config.publicKey.trim();
  const methods = [...new Set(config.paymentMethodTypes.map((x) => x.trim().toLowerCase()).filter(Boolean))];
  if (!sk || !pk || methods.length === 0 ||
      (config.livemode ? (!sk.startsWith("sk_live_") || !pk.startsWith("pk_live_")) : (!sk.startsWith("sk_test_") || !pk.startsWith("pk_test_")))) {
    throw new Error("PAYMENT_PROVIDER_UNSAFE_CONFIGURATION");
  }
  const base = (config.apiBaseUrl ?? BASE).replace(/\/$/, "");
  const request = config.request ?? fetch;
  async function call(path: string, init: RequestInit): Promise<ResponseBody> {
    let response: Response;
    try { response = await request(base + path, init); }
    catch { throw new PaymentsPaymentIntentProviderError("PROVIDER_UNAVAILABLE"); }
    if (!response.ok) throw new PaymentsPaymentIntentProviderError(response.status >= 500 || response.status === 409 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED");
    try { return await response.json() as ResponseBody; }
    catch { throw new PaymentsPaymentIntentProviderError("PROVIDER_UNAVAILABLE"); }
  }
  const intent: PaymentsPaymentIntentProvider = {
    name: "paymongo",
    livemode: config.livemode,
    async createPaymentIntent(input: PaymentsProviderCreatePaymentIntentInput) {
      if (input.paymentMethodAllowed.some((m) => !methods.includes(m))) throw new PaymentsPaymentIntentProviderError("PROVIDER_REJECTED", "PAYMENT_METHOD_NOT_ENABLED");
      const body = await call("/payment_intents", { method: "POST", headers: { Authorization: basic(sk), "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({ data: { attributes: { amount: input.amountMinor, currency: input.currency, payment_method_allowed: input.paymentMethodAllowed,
          description: input.commercialReference, metadata: { bke_source_reference: input.sourceReference, bke_commercial_reference: input.commercialReference } } } }) });
      const parsed = parse(body);
      if (!parsed.clientKey || parsed.amountMinor !== input.amountMinor || parsed.currency !== input.currency.toUpperCase() || parsed.livemode !== config.livemode) {
        throw new PaymentsPaymentIntentProviderError("PROVIDER_REJECTED", "PAYMENT_INTENT_RESPONSE_MISMATCH");
      }
      return parsed;
    },
    async retrievePaymentIntent(id: string) {
      if (!/^pi_[A-Za-z0-9]+$/.test(id)) throw new PaymentsPaymentIntentProviderError("PROVIDER_REJECTED", "PAYMENT_INTENT_ID_INVALID");
      const parsed = parse(await call("/payment_intents/" + encodeURIComponent(id), { method: "GET", headers: { Authorization: basic(sk) } }));
      if (parsed.paymentIntentId !== id || parsed.livemode !== config.livemode) throw new PaymentsPaymentIntentProviderError("PROVIDER_REJECTED", "PAYMENT_INTENT_RESPONSE_MISMATCH");
      return parsed;
    },
    async createPaymentMethod(input) {
      if (!methods.includes(input.type)) throw new PaymentsPaymentIntentProviderError("PROVIDER_REJECTED", "PAYMENT_METHOD_NOT_ENABLED");
      const body = await call("/payment_methods", { method: "POST", headers: { Authorization: basic(pk), "Content-Type": "application/json" },
        body: JSON.stringify({ data: { attributes: { type: input.type, ...(input.expirySeconds === undefined ? {} : { expiry_seconds: input.expirySeconds }) } } }) });
      const id = body.data?.id?.trim() ?? "", type = body.data?.attributes?.type;
      if (!id.startsWith("pm_") || type !== input.type) throw new PaymentsPaymentIntentProviderError("PROVIDER_REJECTED", "PAYMENT_METHOD_RESPONSE_INVALID");
      return { paymentMethodId: id, type: input.type };
    },
    async attachPaymentMethod(input) {
      if (!/^pi_[A-Za-z0-9]+$/.test(input.paymentIntentId) || !input.paymentMethodId.trim() || !input.clientKey.trim()) throw new PaymentsPaymentIntentProviderError("PROVIDER_REJECTED", "PAYMENT_INTENT_CONTINUATION_INVALID");
      const body = await call("/payment_intents/" + encodeURIComponent(input.paymentIntentId) + "/attach", { method: "POST",
        headers: { Authorization: basic(pk), "Content-Type": "application/json" },
        body: JSON.stringify({ data: { attributes: { payment_method: input.paymentMethodId, client_key: input.clientKey } } }) });
      const parsed = parse(body), a = body.data?.attributes ?? {}, next = obj(a.next_action), code = obj(next.code), redirect = obj(next.redirect);
      if (parsed.paymentIntentId !== input.paymentIntentId) throw new PaymentsPaymentIntentProviderError("PROVIDER_REJECTED", "PAYMENT_INTENT_RESPONSE_MISMATCH");
      const expiry = a.expires_at ?? next.expires_at;
      const continuation: PaymentsPaymentIntentContinuation = Object.freeze({
        paymentIntentId: parsed.paymentIntentId, status: parsed.status,
        ...(typeof code.image_url === "string" ? { qrImageUrl: code.image_url } : {}),
        ...(typeof redirect.url === "string" ? { redirectUrl: redirect.url } : {}),
        ...(typeof expiry === "number" && Number.isFinite(expiry) ? { expiresAt: new Date(expiry * 1000) } : {}),
      });
      return continuation;
    },
  };
  return Object.freeze(intent);
}
