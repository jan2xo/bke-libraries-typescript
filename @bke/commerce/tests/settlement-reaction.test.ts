import { describe, expect, it } from "vitest";
import { createCommerceSettlementReactionCapability } from "../logic/settlement-reaction";

function capability(options: {
  payment?: "SETTLED" | "REJECTED" | "FAILED";
  commercial?: "SETTLED" | "NOT_FOUND" | "MISMATCH";
  entitlement?: "GRANTED" | "EXISTING" | "REJECTED" | "FAILED";
} = {}) {
  let grantCalls = 0;
  return {
    grantCalls: () => grantCalls,
    subject: createCommerceSettlementReactionCapability({
      payments: {
        async reconcile() {
          if (options.payment === "REJECTED") return { status: "REJECTED" as const };
          if (options.payment === "FAILED") return { status: "FAILED" as const };
          return {
            status: "SETTLED" as const,
            value: {
              settlementFactId: "settlement-1",
              commercialReference: "order-1",
              amountMinor: 1000,
              currency: "PHP",
              settledAt: new Date("2026-09-03T00:00:00Z"),
            },
          };
        },
      },
      repository: {
        async settle() {
          if (options.commercial === "NOT_FOUND") {
            return { status: "REJECTED" as const, code: "ORDER_NOT_FOUND" as const };
          }
          if (options.commercial === "MISMATCH") {
            return { status: "REJECTED" as const, code: "SETTLEMENT_MISMATCH" as const };
          }
          return {
            status: "SETTLED" as const,
            value: {
              orderId: "order-1",
              invoiceId: "invoice-1",
              accountId: "account-1",
              amountMinor: 1000,
              currency: "PHP",
              orderStatus: "PAID" as const,
              invoiceStatus: "FINAL" as const,
              items: [
                {
                  orderItemId: "item-1",
                  productId: "product-1",
                  editionId: "edition-1",
                  quantity: 1,
                  entitlementSnapshot: { tier: "PRO" },
                  policySnapshot: {},
                },
              ],
            },
          };
        },
      },
      entitlements: {
        async grant() {
          grantCalls += 1;
          const status = options.entitlement ?? "GRANTED";
          return { status } as
            | { status: "GRANTED" | "EXISTING" }
            | { status: "REJECTED" }
            | { status: "FAILED" };
        },
      },
    }),
  };
}

describe("Commerce settlement reaction", () => {
  it("settles Commerce and grants durable rights from a verified Payments settlement", async () => {
    const subject = capability();
    const result = await subject.subject.react({
      providerEventRecordId: "event-row-1",
      expectedLivemode: false,
    });
    expect(result).toEqual({
      status: "FULFILLED",
      value: {
        orderId: "order-1",
        invoiceId: "invoice-1",
        orderStatus: "PAID",
        invoiceStatus: "FINAL",
        settlementFactId: "settlement-1",
        entitlementCount: 1,
      },
    });
    expect(subject.grantCalls()).toBe(1);
  });

  it("rejects an unverified or mismatched payment before entitlement grant", async () => {
    const paymentRejected = capability({ payment: "REJECTED" });
    expect(await paymentRejected.subject.react({ providerEventRecordId: "event", expectedLivemode: false })).toEqual({
      status: "REJECTED",
      code: "PAYMENT_EVENT_REJECTED",
    });
    expect(paymentRejected.grantCalls()).toBe(0);

    const mismatch = capability({ commercial: "MISMATCH" });
    expect(await mismatch.subject.react({ providerEventRecordId: "event", expectedLivemode: false })).toEqual({
      status: "REJECTED",
      code: "SETTLEMENT_MISMATCH",
    });
    expect(mismatch.grantCalls()).toBe(0);
  });

  it("surfaces entitlement unavailability after Commerce settlement so retry can resume idempotently", async () => {
    const subject = capability({ entitlement: "FAILED" });
    expect(await subject.subject.react({ providerEventRecordId: "event", expectedLivemode: false })).toEqual({
      status: "FAILED",
      code: "ENTITLEMENTS_UNAVAILABLE",
    });
    expect(subject.grantCalls()).toBe(1);
  });

  it("accepts an existing deterministic entitlement grant on retry", async () => {
    const subject = capability({ entitlement: "EXISTING" });
    const result = await subject.subject.react({ providerEventRecordId: "event", expectedLivemode: false });
    expect(result.status).toBe("FULFILLED");
  });
});
