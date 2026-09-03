import { describe, expect, it } from "vitest";
import { createCommerceCheckoutOrchestrationCapability } from "../logic/checkout-orchestration";

function input(totalMinor = 1000) {
  return {
    principalId: "principal-1",
    accountId: "account-1",
    legal: {
      documentId: "terms",
      documentVersionId: "terms-v1",
      acceptanceContext: "checkout",
      slaVersion: "1",
      renderedContentSha256: "a".repeat(64),
    },
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
  legal?: "ACCEPTED" | "NOT_ACCEPTED" | "FAILED";
  totalMinor?: number;
  payment?: "READY" | "REJECTED" | "FAILED";
} = {}) {
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
    paymentCalls: () => paymentCalls,
    checkout: createCommerceCheckoutOrchestrationCapability({
      accountAuthorizer: {
        async authorize() {
          return { status: options.account ?? "AUTHORIZED" } as const;
        },
      },
      legalChecker: {
        async check() {
          return { status: options.legal ?? "ACCEPTED" } as const;
        },
      },
      orderInvoiceCreation: {
        async create() {
          return { status: "CREATED" as const, value };
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
    expect(subject.paymentCalls()).toBe(0);
  });

  it("rejects checkout when required legal acceptance is absent", async () => {
    const subject = capability({ legal: "NOT_ACCEPTED" });
    expect(await subject.checkout.start(input())).toEqual({
      status: "REJECTED",
      code: "LEGAL_NOT_ACCEPTED",
    });
    expect(subject.paymentCalls()).toBe(0);
  });

  it("bypasses Payments for a zero-total order", async () => {
    const subject = capability({ totalMinor: 0 });
    const result = await subject.checkout.start(input(0));
    expect(result.status).toBe("PAYMENT_NOT_REQUIRED");
    expect(subject.paymentCalls()).toBe(0);
  });

  it("creates a Payments checkout only after account, legal, and order gates pass", async () => {
    const subject = capability();
    const result = await subject.checkout.start(input());
    expect(result.status).toBe("PAYMENT_READY");
    expect(subject.paymentCalls()).toBe(1);
  });

  it("maps payment provider unavailability without mutating another module", async () => {
    const subject = capability({ payment: "FAILED" });
    expect(await subject.checkout.start(input())).toEqual({
      status: "FAILED",
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
    });
  });
});
