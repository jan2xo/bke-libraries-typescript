import { describe, expect, it } from "vitest";
import { validateCommerceOfferConfiguration } from "../logic/offer-configuration";

describe("Commerce offer configuration policy", () => {
  it("accepts a valid public promotion", () => {
    expect(
      validateCommerceOfferConfiguration({
        type: "GENERAL_PROMOTION",
        discountBps: 2500,
        discountedBillingCycles: null,
        allowZeroTotal: false,
      }),
    ).toEqual({ status: "VALID" });
  });

  it("requires an account for account-scoped and administrative offers", () => {
    for (const type of ["CUSTOMER_ACCOUNT_OFFER", "ADMINISTRATIVE_ADJUSTMENT"] as const) {
      expect(validateCommerceOfferConfiguration({ type, discountBps: 1000 })).toEqual({
        status: "REJECTED",
        code: "OFFER_ACCOUNT_REQUIRED",
      });
    }
  });

  it("preserves V1 promotional-duration policy", () => {
    expect(
      validateCommerceOfferConfiguration({
        type: "GENERAL_PROMOTION",
        discountBps: 1000,
        discountedBillingCycles: 13,
        purchasePlanType: "MONTHLY",
      }),
    ).toEqual({ status: "REJECTED", code: "INVALID_PROMOTIONAL_DURATION" });
    expect(
      validateCommerceOfferConfiguration({
        type: "GENERAL_PROMOTION",
        discountBps: 1000,
        discountedBillingCycles: 2,
        purchasePlanType: "ANNUAL",
      }),
    ).toEqual({ status: "REJECTED", code: "INVALID_PROMOTIONAL_DURATION" });
    expect(
      validateCommerceOfferConfiguration({
        type: "GENERAL_PROMOTION",
        discountBps: 1000,
        discountedBillingCycles: 2,
        purchasePlanType: "MONTHLY",
      }),
    ).toEqual({ status: "VALID" });
  });

  it("allows zero totals only for a full discount", () => {
    expect(
      validateCommerceOfferConfiguration({
        type: "GENERAL_PROMOTION",
        discountBps: 9999,
        allowZeroTotal: true,
      }),
    ).toEqual({ status: "REJECTED", code: "ZERO_TOTAL_REQUIRES_FULL_DISCOUNT" });
    expect(
      validateCommerceOfferConfiguration({
        type: "GENERAL_PROMOTION",
        discountBps: 10_000,
        allowZeroTotal: true,
      }),
    ).toEqual({ status: "VALID" });
  });

  it("rejects invalid basis-point discounts", () => {
    for (const discountBps of [-1, 10_001, 12.5]) {
      expect(
        validateCommerceOfferConfiguration({ type: "GENERAL_PROMOTION", discountBps }),
      ).toEqual({ status: "REJECTED", code: "INVALID_OFFER_DISCOUNT" });
    }
  });
});
