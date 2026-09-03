import { describe, expect, it } from "vitest";
import { createCommerceZeroPaymentFulfillmentCapability } from "../logic/zero-payment-fulfillment";

function capability(options: {
  commercial?: "FULFILLED" | "NOT_FOUND" | "NOT_FULFILLABLE" | "NOT_ZERO" | "THROW";
  entitlement?: "GRANTED" | "EXISTING" | "REJECTED" | "FAILED";
} = {}) {
  let grantCalls = 0;
  const subject = createCommerceZeroPaymentFulfillmentCapability({
    repository: {
      async fulfill() {
        if (options.commercial === "THROW") throw new Error("db unavailable");
        if (options.commercial === "NOT_FOUND") {
          return { status: "REJECTED" as const, code: "ORDER_NOT_FOUND" as const };
        }
        if (options.commercial === "NOT_FULFILLABLE") {
          return { status: "REJECTED" as const, code: "ORDER_NOT_FULFILLABLE" as const };
        }
        if (options.commercial === "NOT_ZERO") {
          return { status: "REJECTED" as const, code: "ORDER_NOT_ZERO_TOTAL" as const };
        }
        return {
          status: "FULFILLED" as const,
          value: {
            orderId: "order-1",
            invoiceId: "invoice-1",
            accountId: "account-1",
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
        return { status: options.entitlement ?? "GRANTED" } as
          | { status: "GRANTED" | "EXISTING" }
          | { status: "REJECTED" }
          | { status: "FAILED" };
      },
    },
  });
  return { subject, grantCalls: () => grantCalls };
}

describe("Commerce zero-payment fulfillment", () => {
  it("finalizes a zero-total order and grants durable rights", async () => {
    const subject = capability();
    expect(
      await subject.subject.fulfill({
        orderId: "order-1",
        fulfilledAt: new Date("2026-09-03T00:00:00Z"),
      }),
    ).toEqual({
      status: "FULFILLED",
      value: {
        orderId: "order-1",
        invoiceId: "invoice-1",
        orderStatus: "PAID",
        invoiceStatus: "FINAL",
        entitlementCount: 1,
      },
    });
    expect(subject.grantCalls()).toBe(1);
  });

  it("rejects a non-zero order before entitlement grant", async () => {
    const subject = capability({ commercial: "NOT_ZERO" });
    expect(
      await subject.subject.fulfill({
        orderId: "order-1",
        fulfilledAt: new Date("2026-09-03T00:00:00Z"),
      }),
    ).toEqual({ status: "REJECTED", code: "ORDER_NOT_ZERO_TOTAL" });
    expect(subject.grantCalls()).toBe(0);
  });

  it("surfaces entitlement unavailability so fulfillment can be retried idempotently", async () => {
    const subject = capability({ entitlement: "FAILED" });
    expect(
      await subject.subject.fulfill({
        orderId: "order-1",
        fulfilledAt: new Date("2026-09-03T00:00:00Z"),
      }),
    ).toEqual({ status: "FAILED", code: "ENTITLEMENTS_UNAVAILABLE" });
    expect(subject.grantCalls()).toBe(1);
  });

  it("accepts an existing deterministic entitlement on retry", async () => {
    const subject = capability({ entitlement: "EXISTING" });
    expect(
      (
        await subject.subject.fulfill({
          orderId: "order-1",
          fulfilledAt: new Date("2026-09-03T00:00:00Z"),
        })
      ).status,
    ).toBe("FULFILLED");
  });
});
