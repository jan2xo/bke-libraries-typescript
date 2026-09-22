import { describe, expect, it } from "vitest";
import { createCommerceZeroPaymentFulfillmentCapability } from "../logic/zero-payment-fulfillment";

function capability(options: {
  mode?: "ACCOUNT_ENTITLEMENT" | "CLAIM_CODE";
  commercial?: "FULFILLED" | "NOT_FOUND" | "NOT_FULFILLABLE" | "NOT_ZERO" | "THROW";
  entitlement?: "GRANTED" | "EXISTING" | "REJECTED" | "FAILED";
  claim?: "ISSUED" | "EXISTING" | "REJECTED" | "FAILED";
  claimUnitsConfigured?: boolean;
} = {}) {
  let grantCalls = 0;
  let claimCalls = 0;
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
            fulfillmentMode: options.mode ?? "ACCOUNT_ENTITLEMENT",
            fulfillmentSnapshot: { recipientEmail: "recipient@example.test" },
            orderStatus: "PAID" as const,
            invoiceStatus: "FINAL" as const,
            items: [
              {
                orderItemId: "item-1",
                productId: "product-1",
                editionId: "edition-1",
                purchasePlanId: "plan-1",
                quantity: 2,
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
    ...(options.claimUnitsConfigured === false ? {} : {
      claimUnits: {
        async issue(input) {
          claimCalls += 1;
          expect(input.fulfillmentSnapshot).toEqual({ recipientEmail: "recipient@example.test" });
          const status = options.claim ?? "ISSUED";
          if (status === "ISSUED" || status === "EXISTING") {
            return { status, unitCount: input.quantity } as const;
          }
          return { status } as { status: "REJECTED" } | { status: "FAILED" };
        },
      },
    }),
  });
  return { subject, grantCalls: () => grantCalls, claimCalls: () => claimCalls };
}

describe("Commerce zero-payment fulfillment", () => {
  it("finalizes a zero-total direct order and grants durable rights", async () => {
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
        fulfillmentMode: "ACCOUNT_ENTITLEMENT",
        entitlementCount: 1,
        claimUnitCount: 0,
      },
    });
    expect(subject.grantCalls()).toBe(1);
    expect(subject.claimCalls()).toBe(0);
  });

  it("issues claim units for a zero-total claim purchase without granting the purchaser", async () => {
    const subject = capability({ mode: "CLAIM_CODE" });
    const result = await subject.subject.fulfill({
      orderId: "order-1",
      fulfilledAt: new Date("2026-09-03T00:00:00Z"),
    });
    expect(result).toEqual({
      status: "FULFILLED",
      value: {
        orderId: "order-1",
        invoiceId: "invoice-1",
        orderStatus: "PAID",
        invoiceStatus: "FINAL",
        fulfillmentMode: "CLAIM_CODE",
        entitlementCount: 0,
        claimUnitCount: 2,
      },
    });
    expect(subject.grantCalls()).toBe(0);
    expect(subject.claimCalls()).toBe(1);
  });

  it("fails closed when a claim purchase reaches an unconfigured claim issuer", async () => {
    const subject = capability({ mode: "CLAIM_CODE", claimUnitsConfigured: false });
    expect(
      await subject.subject.fulfill({
        orderId: "order-1",
        fulfilledAt: new Date("2026-09-03T00:00:00Z"),
      }),
    ).toEqual({ status: "FAILED", code: "CLAIM_UNITS_UNAVAILABLE" });
    expect(subject.grantCalls()).toBe(0);
    expect(subject.claimCalls()).toBe(0);
  });

  it("rejects a non-zero order before any fulfillment grant", async () => {
    const subject = capability({ commercial: "NOT_ZERO" });
    expect(
      await subject.subject.fulfill({
        orderId: "order-1",
        fulfilledAt: new Date("2026-09-03T00:00:00Z"),
      }),
    ).toEqual({ status: "REJECTED", code: "ORDER_NOT_ZERO_TOTAL" });
    expect(subject.grantCalls()).toBe(0);
    expect(subject.claimCalls()).toBe(0);
  });

  it("surfaces direct-entitlement unavailability so fulfillment can be retried idempotently", async () => {
    const subject = capability({ entitlement: "FAILED" });
    expect(
      await subject.subject.fulfill({
        orderId: "order-1",
        fulfilledAt: new Date("2026-09-03T00:00:00Z"),
      }),
    ).toEqual({ status: "FAILED", code: "ENTITLEMENTS_UNAVAILABLE" });
    expect(subject.grantCalls()).toBe(1);
  });

  it("accepts existing deterministic fulfillment on retry", async () => {
    const direct = capability({ entitlement: "EXISTING" });
    expect(
      (
        await direct.subject.fulfill({
          orderId: "order-1",
          fulfilledAt: new Date("2026-09-03T00:00:00Z"),
        })
      ).status,
    ).toBe("FULFILLED");

    const claim = capability({ mode: "CLAIM_CODE", claim: "EXISTING" });
    expect(
      (
        await claim.subject.fulfill({
          orderId: "order-1",
          fulfilledAt: new Date("2026-09-03T00:00:00Z"),
        })
      ).status,
    ).toBe("FULFILLED");
  });
});
