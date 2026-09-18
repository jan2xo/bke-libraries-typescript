import { describe, expect, it } from "vitest";
import { createCommerceSettlementFulfillmentCapability } from "../logic/settlement-fulfillment";

function fixture(mode: "ACCOUNT_ENTITLEMENT" | "CLAIM_CODE") {
  let entitlementCalls = 0;
  let claimCalls = 0;
  const capability = createCommerceSettlementFulfillmentCapability({
    payments: {
      async reconcile() {
        return {
          status: "SETTLED" as const,
          value: {
            settlementFactId: "settlement-1",
            commercialReference: "order-1",
            amountMinor: 1000,
            currency: "PHP",
            settledAt: new Date("2026-09-19T00:00:00Z"),
          },
        };
      },
    },
    repository: {
      async settle() {
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
            settlementDisposition: "STANDARD" as const,
            fulfillmentMode: mode,
            items: [{
              orderItemId: "item-1",
              productId: "product-1",
              editionId: "edition-1",
              purchasePlanId: "plan-1",
              quantity: 2,
              entitlementSnapshot: { tier: "PRO" },
              policySnapshot: {},
            }],
          },
        };
      },
    },
    entitlements: {
      async grant() {
        entitlementCalls += 1;
        return { status: "GRANTED" as const };
      },
    },
    claimUnits: {
      async issue(input) {
        claimCalls += 1;
        return { status: "ISSUED" as const, unitCount: input.quantity };
      },
    },
  });
  return { capability, entitlementCalls: () => entitlementCalls, claimCalls: () => claimCalls };
}

describe("Commerce settlement fulfillment", () => {
  it("keeps direct account purchases on durable Entitlements", async () => {
    const subject = fixture("ACCOUNT_ENTITLEMENT");
    const result = await subject.capability.react({
      providerEventRecordId: "event-1",
      expectedLivemode: false,
    });
    expect(result).toMatchObject({
      status: "FULFILLED",
      value: { fulfillmentMode: "ACCOUNT_ENTITLEMENT", entitlementCount: 1, claimUnitCount: 0 },
    });
    expect(subject.entitlementCalls()).toBe(1);
    expect(subject.claimCalls()).toBe(0);
  });

  it("mints claim units without assigning the purchaser an Entitlement", async () => {
    const subject = fixture("CLAIM_CODE");
    const result = await subject.capability.react({
      providerEventRecordId: "event-1",
      expectedLivemode: false,
    });
    expect(result).toMatchObject({
      status: "FULFILLED",
      value: { fulfillmentMode: "CLAIM_CODE", entitlementCount: 0, claimUnitCount: 2 },
    });
    expect(subject.entitlementCalls()).toBe(0);
    expect(subject.claimCalls()).toBe(1);
  });

  it("fails closed when claim-unit issuance is unavailable", async () => {
    const subject = createCommerceSettlementFulfillmentCapability({
      payments: {
        async reconcile() {
          return {
            status: "SETTLED" as const,
            value: {
              settlementFactId: "settlement-1",
              commercialReference: "order-1",
              amountMinor: 1000,
              currency: "PHP",
              settledAt: new Date("2026-09-19T00:00:00Z"),
            },
          };
        },
      },
      repository: {
        async settle() {
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
              settlementDisposition: "STANDARD" as const,
              fulfillmentMode: "CLAIM_CODE" as const,
              items: [{
                orderItemId: "item-1",
                productId: "product-1",
                editionId: null,
                purchasePlanId: "plan-1",
                quantity: 1,
                entitlementSnapshot: null,
                policySnapshot: {},
              }],
            },
          };
        },
      },
      entitlements: { async grant() { return { status: "GRANTED" as const }; } },
      claimUnits: { async issue() { return { status: "FAILED" as const }; } },
    });
    expect(await subject.react({ providerEventRecordId: "event-1", expectedLivemode: false }))
      .toEqual({ status: "FAILED", code: "CLAIM_UNITS_UNAVAILABLE" });
  });
});
