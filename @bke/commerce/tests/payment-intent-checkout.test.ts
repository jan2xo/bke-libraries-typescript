import { describe, expect, it } from "vitest";
import type { CommerceCheckoutPaymentIntentSnapshot, CommerceStartPaymentIntentCheckoutInput } from "../contracts/payment-intent-checkout.contract";
import type { CommercePaymentIntentCheckoutStarter } from "../logic/checkout-orchestration-ports";
import type { CommercePaymentIntentCheckoutPolicy } from "../contracts/payment-intent-checkout.contract";
import type { PaymentsPaymentIntentCapability } from "../../payments/contracts/payment-intent.contract";
import { createCommercePaymentIntentCheckoutCapability } from "../logic/checkout-orchestration";

type StarterResult = Awaited<ReturnType<CommercePaymentIntentCheckoutStarter["create"]>>;

function input(options: {
  readonly totalMinor?: number;
  readonly offerIdentifier?: string | null;
  readonly fulfillmentMode?: "ACCOUNT_ENTITLEMENT" | "CLAIM_CODE";
  readonly renewalSubscriptionId?: string;
} = {}): CommerceStartPaymentIntentCheckoutInput {
  const totalMinor = options.totalMinor ?? 1000;
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
      sourceReference: "order-source-1",
      ...(options.fulfillmentMode ? { fulfillmentMode: options.fulfillmentMode } : {}),
      ...(options.renewalSubscriptionId ? { renewalSubscriptionId: options.renewalSubscriptionId } : {}),
      orderNumber: "ORD-1",
      invoiceNumber: "INV-1",
      currency: "PHP",
      taxMinor: 0,
      billingSnapshot: {},
      customerSnapshot: {},
      lines: [
        {
          productId: "product-1",
          priceId: "plan-1",
          policyId: "edition-1",
          productName: "Air Stack",
          priceName: "Standard",
          description: "Air Stack Standard",
          quantity: 1,
          unitAmountMinor: totalMinor,
          billingType: "ONE_TIME",
          policySnapshot: {},
        },
      ],
    },
    ...(options.offerIdentifier === undefined ? {} : { offerIdentifier: options.offerIdentifier }),
    paymentSourceReference: "checkout-source-1",
  };
}

const baseIntent: CommerceCheckoutPaymentIntentSnapshot = {
  attemptId: "attempt-1",
  sourceReference: "checkout-source-1",
  provider: "paymongo",
  paymentIntentId: "pi_test_1",
  clientKey: "pi_test_1_client_key",
  status: "awaiting_payment_method",
  amountMinor: 1000,
  currency: "PHP",
  livemode: false,
  createdAt: new Date("2026-11-01T00:00:00.000Z"),
};

function capability(options: {
  readonly account?: "AUTHORIZED" | "REJECTED" | "FAILED";
  readonly legal?: "ACCEPTED" | "NOT_ACCEPTED" | "FAILED";
  readonly pricedTotalMinor?: number;
  readonly renewal?: { readonly totalMinor: number; readonly scheduledOfferApplied: boolean };
  readonly paymentResult?: StarterResult;
  readonly intentOverrides?: Partial<CommerceCheckoutPaymentIntentSnapshot>;
  readonly rejectDuplicateOrder?: boolean;
  readonly policy?: CommercePaymentIntentCheckoutPolicy;
} = {}) {
  let accountCalls = 0;
  let legalCalls = 0;
  let orderCalls = 0;
  let renewalCalls = 0;
  let pricingCalls = 0;
  let fulfillmentCalls = 0;
  let paymentCalls = 0;
  let paymentInput: Parameters<CommercePaymentIntentCheckoutStarter["create"]>[0] | null = null;

  const subject = createCommercePaymentIntentCheckoutCapability({
    accountAuthorizer: {
      async authorize() {
        accountCalls += 1;
        return { status: options.account ?? "AUTHORIZED" };
      },
    },
    legalChecker: {
      async check() {
        legalCalls += 1;
        return { status: options.legal ?? "ACCEPTED" };
      },
    },
    orderInvoiceCreation: {
      async create(orderInput) {
        orderCalls += 1;
        if (options.rejectDuplicateOrder && orderCalls > 1) return { status: "REJECTED" as const, code: "DUPLICATE_NUMBER" as const };
        return {
          status: "CREATED" as const,
          value: {
            orderId: "order-1",
            sourceReference: orderInput.sourceReference ?? null,
            orderNumber: orderInput.orderNumber,
            orderStatus: "PENDING" as const,
            fulfillmentMode: orderInput.fulfillmentMode ?? "ACCOUNT_ENTITLEMENT",
            invoiceId: "invoice-1",
            invoiceNumber: orderInput.invoiceNumber,
            invoiceStatus: "DRAFT" as const,
            currency: orderInput.currency.toUpperCase(),
            subtotalMinor: orderInput.lines.reduce((sum, line) => sum + line.quantity * line.unitAmountMinor, 0),
            taxMinor: orderInput.taxMinor,
            totalMinor: orderInput.lines.reduce((sum, line) => sum + line.quantity * line.unitAmountMinor, 0) + orderInput.taxMinor,
            lineCount: orderInput.lines.length,
          },
        };
      },
    },
    renewalCheckoutPricing: {
      async prepare({ orderId }) {
        renewalCalls += 1;
        expect(orderId).toBe("order-1");
        if (!options.renewal) return { status: "READY" as const, renewal: false as const };
        return {
          status: "READY" as const,
          renewal: true as const,
          subtotalMinor: options.renewal.totalMinor,
          totalMinor: options.renewal.totalMinor,
          scheduledOfferApplied: options.renewal.scheduledOfferApplied,
        };
      },
    },
    checkoutOfferPricing: {
      async price() {
        pricingCalls += 1;
        const totalMinor = options.pricedTotalMinor ?? 1000;
        return {
          status: "PRICED" as const,
          value: {
            orderId: "order-1",
            subtotalMinor: totalMinor,
            totalMinor,
            offer: options.pricedTotalMinor === undefined ? null : {
              redemptionId: "redemption-1",
              offerId: "offer-1",
              name: "Launch",
              code: "LAUNCH",
              type: "GENERAL_PROMOTION" as const,
              scope: "ALL_ELIGIBLE" as const,
              discountBps: 2500,
              discountMinor: 250,
              finalMinor: totalMinor,
              discountedBillingCycles: null,
            },
          },
        };
      },
    },
    zeroPaymentFulfillment: {
      async fulfill({ orderId }) {
        fulfillmentCalls += 1;
        return {
          status: "FULFILLED" as const,
          value: {
            orderId,
            invoiceId: "invoice-1",
            orderStatus: "PAID" as const,
            invoiceStatus: "FINAL" as const,
            fulfillmentMode: "CLAIM_CODE" as const,
            entitlementCount: 0,
            claimUnitCount: 1,
          },
        };
      },
    },
    paymentIntentStarter: {
      async create(value) {
        paymentCalls += 1;
        paymentInput = value;
        if (options.paymentResult) return options.paymentResult;
        return {
          status: "READY" as const,
          disposition: "CREATED" as const,
          value: {
            ...baseIntent,
            sourceReference: value.sourceReference,
            amountMinor: value.amountMinor,
            currency: value.currency,
            livemode: value.livemode,
            ...options.intentOverrides,
          },
        };
      },
    },
    policy: options.policy ?? {
      providerName: "PayMongo",
      livemode: false,
      paymentMethodAllowed: ["qrph"],
    },
  });

  return {
    subject,
    accountCalls: () => accountCalls,
    legalCalls: () => legalCalls,
    orderCalls: () => orderCalls,
    renewalCalls: () => renewalCalls,
    pricingCalls: () => pricingCalls,
    fulfillmentCalls: () => fulfillmentCalls,
    paymentCalls: () => paymentCalls,
    paymentInput: () => paymentInput,
  };
}

describe("Commerce Payment Intent checkout", () => {
  it("returns a validated Payment Intent snapshot after the shared Commerce order and legal pipeline", async () => {
    const subject = capability();
    const result = await subject.subject.start(input());

    expect(result).toMatchObject({
      status: "PAYMENT_INTENT_READY",
      order: { orderId: "order-1", orderStatus: "PENDING", totalMinor: 1000 },
      paymentIntent: {
        attemptId: "attempt-1",
        sourceReference: "checkout-source-1",
        provider: "paymongo",
        paymentIntentId: "pi_test_1",
        clientKey: "pi_test_1_client_key",
        status: "awaiting_payment_method",
        amountMinor: 1000,
        currency: "PHP",
        livemode: false,
      },
    });
    expect(subject.accountCalls()).toBe(1);
    expect(subject.legalCalls()).toBe(2);
    expect(subject.orderCalls()).toBe(1);
    expect(subject.paymentCalls()).toBe(1);
    expect(subject.paymentInput()).toEqual({
      sourceReference: "checkout-source-1",
      commercialReference: "order-1",
      amountMinor: 1000,
      currency: "PHP",
      livemode: false,
      paymentMethodAllowed: ["qrph"],
    });
  });

  it("uses Commerce's repriced offer amount and preserves gift fulfillment data", async () => {
    const subject = capability({ pricedTotalMinor: 750 });
    const giftInput = input({ offerIdentifier: "LAUNCH", fulfillmentMode: "CLAIM_CODE" });
    const result = await subject.subject.start(giftInput);
    expect(result).toMatchObject({
      status: "PAYMENT_INTENT_READY",
      order: { fulfillmentMode: "CLAIM_CODE", totalMinor: 750 },
    });
    expect(subject.paymentInput()?.amountMinor).toBe(750);
  });

  it("uses the scheduled Commerce renewal price without repricing through the ordinary offer path", async () => {
    const subject = capability({
      renewal: { totalMinor: 600, scheduledOfferApplied: true },
    });
    const result = await subject.subject.start(input({ renewalSubscriptionId: "subscription-1" }));
    expect(result).toMatchObject({
      status: "PAYMENT_INTENT_READY",
      order: { totalMinor: 600 },
    });
    expect(subject.renewalCalls()).toBe(1);
    expect(subject.pricingCalls()).toBe(0);
    expect(subject.paymentInput()?.amountMinor).toBe(600);
  });

  it("keeps zero-payment gift fulfillment on the shared path and never starts a Payment Intent", async () => {
    const subject = capability({ pricedTotalMinor: 0 });
    const result = await subject.subject.start(input({ totalMinor: 0, fulfillmentMode: "CLAIM_CODE" }));
    expect(result).toMatchObject({
      status: "PAYMENT_NOT_REQUIRED",
      order: { totalMinor: 0 },
      fulfillment: { fulfillmentMode: "CLAIM_CODE", claimUnitCount: 1 },
    });
    expect(subject.fulfillmentCalls()).toBe(1);
    expect(subject.paymentCalls()).toBe(0);
  });

  it("does not call the Payment Intent starter when authorization or legal acceptance fails", async () => {
    const forbidden = capability({ account: "REJECTED" });
    expect(await forbidden.subject.start(input())).toEqual({
      status: "REJECTED",
      code: "ACCOUNT_FORBIDDEN",
    });
    expect(forbidden.paymentCalls()).toBe(0);
    expect(forbidden.legalCalls()).toBe(0);

    const declined = capability({ legal: "NOT_ACCEPTED" });
    expect(await declined.subject.start(input())).toEqual({
      status: "REJECTED",
      code: "LEGAL_NOT_ACCEPTED",
    });
    expect(declined.paymentCalls()).toBe(0);
    expect(declined.orderCalls()).toBe(0);
  });

  it.each([
    ["REQUEST_IN_PROGRESS", "PAYMENT_INTENT_IN_PROGRESS"],
    ["CREATION_DISABLED", "PAYMENT_INTENT_CREATION_DISABLED"],
    ["RECOVERY_REQUIRED", "PAYMENT_INTENT_RECOVERY_REQUIRED"],
    ["MODE_MISMATCH", "PAYMENT_INTENT_MODE_MISMATCH"],
    ["PERSISTENCE_UNAVAILABLE", "PAYMENT_INTENT_PERSISTENCE_UNAVAILABLE"],
    ["PROVIDER_UNAVAILABLE", "PAYMENT_INTENT_PROVIDER_UNAVAILABLE"],
    ["PROVIDER_REJECTED", "PAYMENT_INTENT_PROVIDER_REJECTED"],
    ["PAYMENT_INTENT_MISMATCH", "PAYMENT_INTENT_MISMATCH"],
  ] as const)("preserves Payment Intent failure %s", async (paymentCode, commerceCode) => {
    const subject = capability({
      paymentResult: { status: "FAILED", code: paymentCode },
    });
    expect(await subject.subject.start(input())).toEqual({
      status: "FAILED",
      code: commerceCode,
    });
    expect(subject.fulfillmentCalls()).toBe(0);
  });

  it("returns source conflicts as rejections instead of payment failures", async () => {
    const subject = capability({
      paymentResult: { status: "REJECTED", code: "SOURCE_CONFLICT" },
    });
    expect(await subject.subject.start(input())).toEqual({
      status: "REJECTED",
      code: "PAYMENT_SOURCE_CONFLICT",
    });
  });

  it.each([
    ["sourceReference", { sourceReference: "different-source" }],
    ["provider", { provider: "other-provider" }],
    ["attempt id", { attemptId: "" }],
    ["intent id", { paymentIntentId: "" }],
    ["client key", { clientKey: "" }],
    ["amount", { amountMinor: 999 }],
    ["currency", { currency: "USD" }],
    ["mode", { livemode: true }],
    ["lifecycle", { status: "unknown" as unknown as CommerceCheckoutPaymentIntentSnapshot["status"] }],
  ])("rejects a malformed or mismatched returned intent (%s)", async (_label, overrides) => {
    const subject = capability({ intentOverrides: overrides });
    expect(await subject.subject.start(input())).toEqual({
      status: "FAILED",
      code: "PAYMENT_INTENT_MISMATCH",
    });
  });

  it("treats this as one-shot order creation after an in-progress intent; host recovery must look up the original source", async () => {
    const subject = capability({
      rejectDuplicateOrder: true,
      paymentResult: { status: "FAILED", code: "REQUEST_IN_PROGRESS" },
    });

    expect(await subject.subject.start(input())).toEqual({
      status: "FAILED",
      code: "PAYMENT_INTENT_IN_PROGRESS",
    });
    expect(await subject.subject.start(input())).toEqual({
      status: "REJECTED",
      code: "ORDER_CONFLICT",
    });
    expect(subject.orderCalls()).toBe(2);
    expect(subject.paymentCalls()).toBe(1);
  });

  it("copies constructor policy so later caller mutation cannot change the Payment Intent request or accepted provider", async () => {
    const mutablePolicy = {
      providerName: "PayMongo",
      livemode: false,
      paymentMethodAllowed: ["qrph"],
    };
    const subject = capability({ policy: mutablePolicy });
    mutablePolicy.providerName = "other-provider";
    mutablePolicy.livemode = true;
    mutablePolicy.paymentMethodAllowed[0] = "card";

    const result = await subject.subject.start(input());
    expect(result).toMatchObject({
      status: "PAYMENT_INTENT_READY",
      paymentIntent: { provider: "paymongo", livemode: false },
    });
    expect(subject.paymentInput()).toMatchObject({
      livemode: false,
      paymentMethodAllowed: ["qrph"],
    });
  });

  it("accepts succeeded lifecycle as an intent state without treating it as settlement or fulfilling the order", async () => {
    const subject = capability({ intentOverrides: { status: "succeeded" } });
    const result = await subject.subject.start(input());
    expect(result).toMatchObject({
      status: "PAYMENT_INTENT_READY",
      paymentIntent: { status: "succeeded" },
    });
    expect(subject.fulfillmentCalls()).toBe(0);
  });

  it("is structurally assignable to the Payments 0.10 create capability without a runtime dependency", () => {
    const commerceStarter: CommercePaymentIntentCheckoutStarter = {
      async create(value) {
        return {
          status: "FAILED",
          code: value.livemode ? "MODE_MISMATCH" : "REQUEST_IN_PROGRESS",
        };
      },
    };
    const paymentsCreate: Pick<PaymentsPaymentIntentCapability, "create"> = commerceStarter;
    expect(paymentsCreate).toBe(commerceStarter);
    const commerceCreate: CommercePaymentIntentCheckoutStarter = paymentsCreate;
    expect(commerceCreate).toBe(commerceStarter);
  });

  it("requires explicit trusted constructor policy", () => {
    expect(() => createCommercePaymentIntentCheckoutCapability({
      accountAuthorizer: { async authorize() { return { status: "AUTHORIZED" as const }; } },
      legalChecker: { async check() { return { status: "ACCEPTED" as const }; } },
      orderInvoiceCreation: { async create() { throw new Error("not called"); } },
      checkoutOfferPricing: { async price() { throw new Error("not called"); } },
      zeroPaymentFulfillment: { async fulfill() { throw new Error("not called"); } },
      paymentIntentStarter: { async create() { throw new Error("not called"); } },
      policy: { providerName: "paymongo", livemode: false, paymentMethodAllowed: [] },
    })).toThrow("COMMERCE_PAYMENT_INTENT_CONFIGURATION_INVALID");
  });
});
