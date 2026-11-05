import { describe, expect, it } from "vitest";
import { createPayMongoPaymentIntentAdapter } from "../providers/paymongo/paymongo-payment-intent-adapter";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("PayMongo Payment Intent adapter protocol", () => {
  it("creates a PI with secret authentication, immutable amount and idempotency key", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const adapter = createPayMongoPaymentIntentAdapter({
      secretKey: "sk_test_intent", publicKey: "pk_test_intent", livemode: false,
      paymentMethodTypes: ["qrph"],
      request: async (url, init) => {
        seen.push({ url: String(url), init });
        return json({ data: { id: "pi_test_123", attributes: {
          amount: 12345, currency: "PHP", status: "awaiting_payment_method", livemode: false,
          client_key: "pi_test_123_client_secret",
        } } });
      },
    });
    const result = await adapter.createPaymentIntent({
      amountMinor: 12345, currency: "PHP", paymentMethodAllowed: ["qrph"],
      commercialReference: "ORDER-123", sourceReference: "source-123", idempotencyKey: "bke_pi_stable_123",
    });
    expect(result).toMatchObject({ paymentIntentId: "pi_test_123", clientKey: "pi_test_123_client_secret",
      status: "awaiting_payment_method", amountMinor: 12345, currency: "PHP", livemode: false });
    expect(seen[0]?.url).toBe("https://orders-api.paymongo.com/v1/payment_intents");
    const headers = seen[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Basic " + btoa("sk_test_intent:"));
    expect(headers["Idempotency-Key"]).toBe("bke_pi_stable_123");
    expect(JSON.parse(String(seen[0]?.init?.body)).data.attributes).toMatchObject({
      amount: 12345, currency: "PHP", payment_method_allowed: ["qrph"],
      description: "ORDER-123", metadata: { bke_source_reference: "source-123", bke_commercial_reference: "ORDER-123" },
    });
  });

  it("creates and attaches QR Ph with public-key auth and returns the provider QR image", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const adapter = createPayMongoPaymentIntentAdapter({
      secretKey: "sk_test_intent", publicKey: "pk_test_intent", livemode: false, paymentMethodTypes: ["qrph"],
      request: async (url, init) => {
        seen.push({ url: String(url), init });
        if (String(url).endsWith("/payment_methods")) {
          return json({ data: { id: "pm_test_456", attributes: { type: "qrph" } } });
        }
        return json({ data: { id: "pi_test_123", attributes: {
          amount: 12345, currency: "PHP", status: "awaiting_next_action", livemode: false,
          client_key: "pi_test_client_key", next_action: { code: { image_url: "data:image/png;base64,QUJD" } },
        } } });
      },
    });
    const pm = await adapter.createPaymentMethod({ type: "qrph", expirySeconds: 1800 });
    expect(pm).toEqual({ paymentMethodId: "pm_test_456", type: "qrph" });
    expect((seen[0]?.init?.headers as Record<string,string>).Authorization).toBe("Basic " + btoa("pk_test_intent:"));
    expect(JSON.parse(String(seen[0]?.init?.body)).data.attributes).toEqual({ type: "qrph", expiry_seconds: 1800 });
    const attached = await adapter.attachPaymentMethod({ paymentIntentId: "pi_test_123", paymentMethodId: pm.paymentMethodId, clientKey: "pi_test_client_key" });
    expect(seen[1]?.url).toBe("https://orders-api.paymongo.com/v1/payment_intents/pi_test_123/attach");
    expect((seen[1]?.init?.headers as Record<string,string>).Authorization).toBe("Basic " + btoa("pk_test_intent:"));
    expect(JSON.parse(String(seen[1]?.init?.body)).data.attributes).toEqual({ payment_method: "pm_test_456", client_key: "pi_test_client_key" });
    expect(attached).toEqual({ paymentIntentId: "pi_test_123", status: "awaiting_next_action", qrImageUrl: "data:image/png;base64,QUJD" });
    expect("checkoutUrl" in attached).toBe(false);
  });

  it("retrieves PI state and rejects method types unavailable to the configured merchant", async () => {
    const adapter = createPayMongoPaymentIntentAdapter({
      secretKey: "sk_test_intent", publicKey: "pk_test_intent", livemode: false, paymentMethodTypes: ["qrph"],
      request: async (url) => {
        expect(String(url)).toBe("https://orders-api.paymongo.com/v1/payment_intents/pi_test_123");
        return json({ data: { id: "pi_test_123", attributes: {
          amount: 12345, currency: "PHP", status: "awaiting_next_action", livemode: false,
          client_key: "client_key", next_action: { code: { image_url: "data:image/png;base64,QUJD" } },
        } } });
      },
    });
    await expect(adapter.retrievePaymentIntent("pi_test_123")).resolves.toMatchObject({ paymentIntentId: "pi_test_123", status: "awaiting_next_action", qrImageUrl: "data:image/png;base64,QUJD" });
    await expect(adapter.createPaymentMethod({ type: "gcash" })).rejects.toMatchObject({ code: "PROVIDER_REJECTED" });
  });
});
