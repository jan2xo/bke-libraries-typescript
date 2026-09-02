import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PaymentsProviderCheckoutInput } from "../logic/checkout-attempt-provider";
import { PaymentsProviderError } from "../logic/checkout-attempt-provider";
import { createPayMongoPaymentsAdapter } from "../providers/paymongo/paymongo-adapter";

const NOW = new Date("2026-09-02T12:00:00.000Z");
const TIMESTAMP = Math.floor(NOW.getTime() / 1000);

const checkoutInput: PaymentsProviderCheckoutInput = {
  attemptId: "attempt-1",
  sourceReference: "checkout-source-1",
  commercialReference: "ORDER-2026-001",
  amountMinor: 300000,
  currency: "PHP",
  payer: { name: "Ada Buyer", email: "ada@example.test" },
  items: [
    { name: "Air Stack Pro", description: "Annual license", amountMinor: 300000, quantity: 1 },
  ],
  idempotencyKey: "attempt-1",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function signature(raw: string, secret: string, livemode: boolean, timestamp = TIMESTAMP) {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return `t=${timestamp},${livemode ? "li" : "te"}=${digest}`;
}

function eventBody(overrides?: Partial<{ type: string; livemode: boolean; resource: unknown }>) {
  return JSON.stringify({
    data: {
      id: "evt_paymongo_1",
      attributes: {
        type: overrides?.type ?? "checkout_session.payment.paid",
        livemode: overrides?.livemode ?? false,
        created_at: TIMESTAMP,
        data:
          overrides?.resource ??
          {
            id: "cs_123",
            type: "checkout_session",
            attributes: {
              reference_number: "ORDER-2026-001",
              payments: [
                {
                  id: "pay_123",
                  type: "payment",
                  attributes: { amount: 300000, currency: "PHP" },
                },
              ],
            },
          },
      },
    },
  });
}

describe("PayMongo Payments adapter", () => {
  it("fails closed on unsafe key/environment combinations before HTTP", () => {
    expect(() =>
      createPayMongoPaymentsAdapter({
        secretKey: "sk_live_wrong",
        webhookSecret: "whsec_test",
        livemode: false,
        successUrl: () => "https://example.test/success",
        cancelUrl: () => "https://example.test/cancel",
      }),
    ).toThrow("PAYMENT_PROVIDER_UNSAFE_CONFIGURATION");

    expect(() =>
      createPayMongoPaymentsAdapter({
        secretKey: "sk_test_wrong",
        webhookSecret: "whsec_live",
        livemode: true,
        successUrl: () => "https://example.test/success",
        cancelUrl: () => "https://example.test/cancel",
      }),
    ).toThrow("PAYMENT_PROVIDER_UNSAFE_CONFIGURATION");
  });

  it("maps checkout input to PayMongo with exact auth, idempotency, reference, URLs, and QR Ph default", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const adapter = createPayMongoPaymentsAdapter({
      secretKey: "sk_test_checkout",
      webhookSecret: "whsec_checkout",
      livemode: false,
      successUrl: (input) => `https://host.test/payments/${input.attemptId}/success`,
      cancelUrl: (input) => `https://host.test/payments/${input.attemptId}/cancel`,
      request: async (url, init) => {
        requests.push({ url: String(url), init });
        return jsonResponse({ data: { id: "cs_123", attributes: { checkout_url: "https://checkout.paymongo.test/cs_123" } } });
      },
    });

    await expect(adapter.createCheckout(checkoutInput)).resolves.toEqual({
      externalCheckoutId: "cs_123",
      checkoutUrl: "https://checkout.paymongo.test/cs_123",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.paymongo.com/v1/checkout_sessions");
    const headers = requests[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("sk_test_checkout:").toString("base64")}`);
    expect(headers["Idempotency-Key"]).toBe("attempt-1");
    const body = JSON.parse(String(requests[0]?.init?.body));
    expect(body.data.attributes.reference_number).toBe("ORDER-2026-001");
    expect(body.data.attributes.payment_method_types).toEqual(["qrph"]);
    expect(body.data.attributes.success_url).toBe("https://host.test/payments/attempt-1/success");
    expect(body.data.attributes.cancel_url).toBe("https://host.test/payments/attempt-1/cancel");
    expect(body.data.attributes.billing).toEqual({ name: "Ada Buyer", email: "ada@example.test" });
    expect(body.data.attributes.line_items[0]).toMatchObject({ amount: 300000, currency: "PHP", quantity: 1 });
  });

  it("keeps V1 checkout failure semantics and rejects malformed success bodies", async () => {
    const unavailable = createPayMongoPaymentsAdapter({
      secretKey: "sk_test_unavailable",
      webhookSecret: "whsec_unavailable",
      livemode: false,
      successUrl: () => "https://example.test/success",
      cancelUrl: () => "https://example.test/cancel",
      request: async () => jsonResponse({ error: "bad request" }, 422),
    });
    await expect(unavailable.createCheckout(checkoutInput)).rejects.toMatchObject({
      name: "PaymentsProviderError",
      code: "PROVIDER_UNAVAILABLE",
    } satisfies Partial<PaymentsProviderError>);

    const malformed = createPayMongoPaymentsAdapter({
      secretKey: "sk_test_malformed",
      webhookSecret: "whsec_malformed",
      livemode: false,
      successUrl: () => "https://example.test/success",
      cancelUrl: () => "https://example.test/cancel",
      request: async () => jsonResponse({ data: { id: "cs_123", attributes: {} } }),
    });
    await expect(malformed.createCheckout(checkoutInput)).rejects.toMatchObject({ code: "PROVIDER_REJECTED" });
  });

  it("verifies a real test-mode HMAC signature and normalizes a checkout paid event", async () => {
    const webhookSecret = "whsec_test_signature";
    const raw = eventBody();
    const adapter = createPayMongoPaymentsAdapter({
      secretKey: "sk_test_webhook",
      webhookSecret,
      livemode: false,
      successUrl: () => "https://example.test/success",
      cancelUrl: () => "https://example.test/cancel",
      now: () => NOW,
      request: async () => {
        throw new Error("webhook verification must not call HTTP");
      },
    });

    const event = await adapter.verifyAndParse(new TextEncoder().encode(raw), {
      "PayMongo-Signature": signature(raw, webhookSecret, false),
    });
    expect(event).toMatchObject({
      eventId: "evt_paymongo_1",
      rawType: "checkout_session.payment.paid",
      type: "payment.paid",
      externalPaymentId: "pay_123",
      externalCheckoutId: "cs_123",
      reference: "ORDER-2026-001",
      amountMinor: 300000,
      currency: "PHP",
      livemode: false,
    });
    expect(event.occurredAt.toISOString()).toBe(NOW.toISOString());
  });

  it("uses the live signature slot in live mode and rejects stale/invalid signatures", async () => {
    const secret = "whsec_live_signature";
    const raw = eventBody({ livemode: true });
    const live = createPayMongoPaymentsAdapter({
      secretKey: "sk_live_webhook",
      webhookSecret: secret,
      livemode: true,
      successUrl: () => "https://example.test/success",
      cancelUrl: () => "https://example.test/cancel",
      now: () => NOW,
    });
    await expect(
      live.verifyAndParse(new TextEncoder().encode(raw), {
        "paymongo-signature": signature(raw, secret, true),
      }),
    ).resolves.toMatchObject({ type: "payment.paid", livemode: true });

    await expect(
      live.verifyAndParse(new TextEncoder().encode(raw), {
        "paymongo-signature": signature(raw, secret, true, TIMESTAMP - 301),
      }),
    ).rejects.toThrow("PAYMENT_SIGNATURE_STALE");

    await expect(
      live.verifyAndParse(new TextEncoder().encode(raw), {
        "paymongo-signature": `t=${TIMESTAMP},li=deadbeef`,
      }),
    ).rejects.toThrow("PAYMENT_SIGNATURE_INVALID");
  });

  it("normalizes refund.updated evidence without inventing settlement reactions", async () => {
    const secret = "whsec_refund_event";
    const raw = eventBody({
      type: "payment.refund.updated",
      resource: {
        id: "refund_123",
        type: "refund",
        attributes: {
          status: "success",
          payment_id: "pay_123",
          amount: 100000,
          currency: "PHP",
        },
      },
    });
    const adapter = createPayMongoPaymentsAdapter({
      secretKey: "sk_test_refund_event",
      webhookSecret: secret,
      livemode: false,
      successUrl: () => "https://example.test/success",
      cancelUrl: () => "https://example.test/cancel",
      now: () => NOW,
    });
    await expect(
      adapter.verifyAndParse(new TextEncoder().encode(raw), {
        "paymongo-signature": signature(raw, secret, false),
      }),
    ).resolves.toMatchObject({
      type: "payment.refund.updated",
      externalRefundId: "refund_123",
      externalPaymentId: "pay_123",
      refundStatus: "succeeded",
      amountMinor: 100000,
      currency: "PHP",
    });
  });

  it("maps refund input and provider response and preserves deterministic refusal semantics", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const adapter = createPayMongoPaymentsAdapter({
      secretKey: "sk_test_refund",
      webhookSecret: "whsec_refund",
      livemode: false,
      successUrl: () => "https://example.test/success",
      cancelUrl: () => "https://example.test/cancel",
      request: async (url, init) => {
        requests.push({ url: String(url), init });
        return jsonResponse({
          data: {
            id: "refund_789",
            attributes: { status: "success", amount: 100000, payment_id: "pay_123" },
          },
        });
      },
    });
    await expect(
      adapter.createRefund({
        externalPaymentId: "pay_123",
        amountMinor: 100000,
        reason: "requested_by_customer",
        notes: "x".repeat(300),
        idempotencyKey: "refund-operation-1",
      }),
    ).resolves.toEqual({
      externalRefundId: "refund_789",
      status: "succeeded",
      amountMinor: 100000,
      externalPaymentId: "pay_123",
    });
    const headers = requests[0]?.init?.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("refund-operation-1");
    const body = JSON.parse(String(requests[0]?.init?.body));
    expect(body.data.attributes.payment_id).toBe("pay_123");
    expect(body.data.attributes.notes).toHaveLength(240);

    const refused = createPayMongoPaymentsAdapter({
      secretKey: "sk_test_refused",
      webhookSecret: "whsec_refused",
      livemode: false,
      successUrl: () => "https://example.test/success",
      cancelUrl: () => "https://example.test/cancel",
      request: async () => jsonResponse({ error: "not allowed" }, 422),
    });
    await expect(
      refused.createRefund({
        externalPaymentId: "pay_123",
        amountMinor: 100000,
        reason: "other",
        idempotencyKey: "refund-operation-2",
      }),
    ).rejects.toThrow("PAYMENT_REFUND_NOT_ALLOWED");
  });
});
