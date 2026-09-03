import { describe, expect, it } from "vitest";
import { createCommerceCheckoutOrchestrationCapability } from "../logic/checkout-orchestration";

function input(totalMinor = 1000) {
  return {
    principalId: "principal-1",
    accountId: "account-1",
    legal: [
      {
        documentId: "license",
        documentVersionId: "license-v1",
        acceptanceContext: "checkout",
        slaVersion: "1",
        renderedContentSha256: "a".repeat(64),
      },
      {
        documentId: "refund",
        documentVersionId: "refund-v1",
        acceptanceContext: "checkout",
        slaVersion: "1",
        renderedContentSha256: "b".repeat(64),
      },
    ],
    order: {
      accountId: "account-1",
      orderNumber: "ORD-1",
      invoiceNumber: "INV-1",
      currency: "PHP",
      taxMinor: 0,
      billingSnapshot: {},
      customerSnapshot: {},
      lines: [
        {
          productId: "product-1",
          priceId: "price-1",
          policyId: "policy-1",
          productName: "Air Stack",
          priceName: "Standard",
          description: "Air Stack Standard",
          quantity: 1,
          unitAmountMinor: totalMinor,
          billingType: "ONE_TIME" as const,
          policySnapshot: {},
        },
      ],
    },
    paymentSourceReference: "checkout-1",
    payer: { name: "Buyer", email: "buyer@example.test" },
  };
}

function capability(options: {
  account?: "AUTHORIZED" | "REJECTED" | "FAILED";
  legal?: readonly ("ACCEPTED" | "NOT_ACCEPTED" | "FAILED")[];
  totalMinor?: number;
  fulfillment?: "FULFILLED" | "ORDER_CONFLICT" | "ENTITLEMENT_CONFLICT" | "ENTITLEMENTS_UNAVAILABLE";
  payment?: "READY" | "REJECTED" | "FAILED";
} = {}) {
  let legalCalls = 0;
  let fulfillmentCalls = 0;
  let paymentCalls = 0;
  const totalMinor = options.totalMinor ?? 1000;
  const value = {
    orderId: "order-1",
    orderNumber: "ORD-1",
    orderStatus: "PENDING" as const,
    invoiceId: "invoice-1",
    invoiceNumber: "INV-1",
    invoiceStatus: "DRAFT" as const,
    currency: "PHP",
    subtotalMinor: totalMinor,
    taxMinor: 0,
    totalMinor,
    lineCount: 1,
  };
  return {
    legalCalls: () => legalCalls,
    fulfillmentCalls: () => fulfillmentCalls,
    paymentCalls: () => paymentCalls,
    checkout: createCommerceCheckoutOrchestrationCapability({
      accountAuthorizer: {
        async authorize() {
          const status = options.account ?? "AUTHORIZED";
          return { status } as
            | { status: "AUTHORIZED" }
            | { status: "REJECTED" }
            | { status: "FAILED" };
        },
      },
      legalChecker: {
        async check() {
          const status = options.legal?.[legalCalls] ?? "ACCEPTED";
          legalCalls += 1;
          return { status } as
            | { status: "ACCEPTED" }
            | { status: "NOT_ACCEPTED" }
            | { status: "FAILED" };
        },
      },
      orderInvoiceCreation: {
        async create() {
          return { status: "CREATED" as const, value };
        },
      },
      zeroPaymentFulfillment: {
        async fulfill() {
          fulfillmentCalls += 1;
          if (options.fulfillment === "ORDER_CONFLICT") {
            return { status: "REJECTED" as const, code: "ORDER_NOT_FULFILLABLE" as const };
          }
          if (options.fulfillment === "ENTITLEMENT_CONFLICT") {
            return { status: "REJECTED" as const, code: "ENTITLEMENT_CONFLICT" as const };
          }
          if (options.fulfillment === "ENTITLEMENTS_UNAVAILABLE") {
            return { status: "FAILED" as const, code: "ENTITLEMENTS_UNAVAILABLE" as const };
          }
          return {
            status: "FULFILLED" as const,
            value: {
              orderId: "order-1",
              invoiceId: "invoice-1",
              orderStatus: "PAID" as const,
              invoiceStatus: "FINAL" as const,
              entitlementCount: 1,
            },
          };
        },
      },
      paymentStarter: {
        async create() {
          paymentCalls += 1;
          if (options.payment === "REJECTED") return { status: "REJECTED" as const };
          if (options.payment === "FAILED") {
            return { status: "FAILED" as const, code: "PROVIDER_UNAVAILABLE" as const };
          }
          return {
            status: "READY" as const,
            value: {
              attemptId: "attempt-1",
              provider: "fakepay",
              externalCheckoutId: "checkout-external-1",
              checkoutUrl: "https://example.test/checkout",
              amountMinor: totalMinor,
              currency: "PHP",
            },
          };
        },
      },
    }),
  };
}

describe("Commerce checkout orchestration", () => {
  it("rejects checkout when account purchase access is forbidden", async () => {
    const subject = capability({ account: "REJECTED" });
    expect(await subject.checkout.start(input())).toEqual({
      status: "REJECTED",
      code: "ACCOUNT_FORBIDDEN",
    });
    expect(subject.legalCalls()).toBe(0);
    expect(subject.paymentCalls()).toBe(0);
  });

  it("checks every supplied legal requirement before creating payment", async () => {
    const subject = capability();
    expect((await subject.checkout.start(input())).status).toBe("PAYMENT_READY");
    expect(subject.legalCalls()).toBe(2);
    expect(subject.paymentCalls()).toBe(1);
  });

  it("rejects checkout when any required legal acceptance is absent", async () => {
    const subject = capability({ legal: ["ACCEPTED", "NOT_ACCEPTED"] });
    expect(await subject.checkout.start(input())).toEqual({
      status: "REJECTED",
      code: "LEGAL_NOT_ACCEPTED",
    });
    expect(subject.legalCalls()).toBe(2);
    expect(subject.paymentCalls()).toBe(0);
  });

  it("rejects an empty or duplicate legal bundle as invalid input", async () => {
    const empty = input();
    empty.legal = [];
    expect((await capability().checkout.start(empty)).status).toBe("FAILED");

    const duplicate = input();
    duplicate.legal[1] = { ...duplicate.legal[0]! };
    expect(await capability().checkout.start(duplicate)).toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
  });

  it("fully fulfills a zero-total order without calling Payments", async () => {
    const subject = capability({ totalMinor: 0 });
    const result = await subject.checkout.start(input(0));
    expect(result).toEqual({
      status: "PAYMENT_NOT_REQUIRED",
      order: expect.objectContaining({ orderId: "order-1", totalMinor: 0 }),
      fulfillment: {
        orderId: "order-1",
        invoiceId: "invoice-1",
        orderStatus: "PAID",
        invoiceStatus: "FINAL",
        entitlementCount: 1,
      },
    });
    expect(subject.fulfillmentCalls()).toBe(1);
    expect(subject.paymentCalls()).toBe(0);
  });

  it("surfaces zero-payment entitlement unavailability instead of reporting false success", async () => {
    const subject = capability({ totalMinor: 0, fulfillment: "ENTITLEMENTS_UNAVAILABLE" });
    expect(await subject.checkout.start(input(0))).toEqual({
      status: "FAILED",
      code: "ENTITLEMENTS_UNAVAILABLE",
    });
    expect(subject.paymentCalls()).toBe(0);
  });

  it("maps payment provider unavailability without mutating another module", async () => {
    const subject = capability({ payment: "FAILED" });
    expect(await subject.checkout.start(input())).toEqual({
      status: "FAILED",
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
    });
  });
});
