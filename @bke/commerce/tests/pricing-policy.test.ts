import { describe, expect, it } from "vitest";
import {
  ANNUAL_DISCOUNT_MAX_BPS,
  ANNUAL_DISCOUNT_MIN_BPS,
  OFFER_DISCOUNT_MAX_BPS,
  OFFER_DISCOUNT_MIN_BPS,
  applyCommerceOfferDiscount,
  calculateCommerceAnnualPricing,
  commercePurchasePlanLabel,
  resolveCommercePurchasePlan,
  roundCommerceRatioHalfUp,
} from "../logic/pricing-policy";

describe("Commerce canonical pricing policy", () => {
  it("preserves the V1 discount policy bounds", () => {
    expect(ANNUAL_DISCOUNT_MIN_BPS).toBe(0);
    expect(ANNUAL_DISCOUNT_MAX_BPS).toBe(1_000);
    expect(OFFER_DISCOUNT_MIN_BPS).toBe(0);
    expect(OFFER_DISCOUNT_MAX_BPS).toBe(10_000);
  });

  it("rounds integer money ratios half up exactly like V1", () => {
    expect(roundCommerceRatioHalfUp(1n, 2n)).toBe(1);
    expect(roundCommerceRatioHalfUp(874125n, 1000n)).toBe(874);
    expect(() => roundCommerceRatioHalfUp(-1n, 2n)).toThrow("INVALID_MONEY_RATIO");
    expect(() => roundCommerceRatioHalfUp(1n, 0n)).toThrow("INVALID_MONEY_RATIO");
  });

  it("preserves V1 annual price derivation", () => {
    expect(calculateCommerceAnnualPricing(1_001, 1_000)).toEqual({
      monthlyAmountMinor: 1_001,
      discountBps: 1_000,
      grossAnnualMinor: 12_012,
      annualAmountMinor: 10_811,
      savingsMinor: 1_201,
      effectiveMonthlyMinor: 901,
    });
    expect(() => calculateCommerceAnnualPricing(0, 0)).toThrow("INVALID_MONTHLY_AMOUNT");
    expect(() => calculateCommerceAnnualPricing(1_000, 1_001)).toThrow("INVALID_ANNUAL_DISCOUNT");
  });

  it("preserves V1 offer rounding by rounding final amount half up", () => {
    expect(applyCommerceOfferDiscount(999, 1_250)).toEqual({
      catalogAmountMinor: 999,
      discountBps: 1_250,
      discountAmountMinor: 125,
      finalAmountMinor: 874,
    });
    expect(applyCommerceOfferDiscount(1, 5_000)).toEqual({
      catalogAmountMinor: 1,
      discountBps: 5_000,
      discountAmountMinor: 0,
      finalAmountMinor: 1,
    });
    expect(applyCommerceOfferDiscount(1, 6_000)).toEqual({
      catalogAmountMinor: 1,
      discountBps: 6_000,
      discountAmountMinor: 1,
      finalAmountMinor: 0,
    });
    expect(() => applyCommerceOfferDiscount(0, 1_000)).toThrow("INVALID_CATALOG_AMOUNT");
    expect(() => applyCommerceOfferDiscount(100, 10_001)).toThrow("INVALID_OFFER_DISCOUNT");
  });

  it("resolves annual and non-annual purchase plans with V1 shapes", () => {
    expect(resolveCommercePurchasePlan({
      id: "monthly",
      editionId: "edition-1",
      type: "MONTHLY",
      currency: "PHP",
      amountMinor: 25_000,
      annualDiscountBps: null,
      renewalBehavior: "CUSTOMER_AUTHORIZED",
      monthlySource: null,
    })).toEqual({
      amountMinor: 25_000,
      intervalUnit: "MONTH",
      intervalCount: 1,
      billingType: "SUBSCRIPTION",
      monthlyAmountMinor: 25_000,
      discountBps: 0,
      grossAnnualMinor: null,
      annualAmountMinor: null,
      savingsMinor: 0,
      effectiveMonthlyMinor: 25_000,
    });

    expect(resolveCommercePurchasePlan({
      id: "annual",
      editionId: "edition-1",
      type: "ANNUAL",
      currency: "PHP",
      amountMinor: null,
      annualDiscountBps: 1_000,
      renewalBehavior: "CUSTOMER_AUTHORIZED",
      monthlySource: {
        active: true,
        amountMinor: 1_001,
        type: "MONTHLY",
        editionId: "edition-1",
      },
    })).toMatchObject({
      amountMinor: 10_811,
      annualAmountMinor: 10_811,
      grossAnnualMinor: 12_012,
      savingsMinor: 1_201,
      intervalUnit: "YEAR",
      intervalCount: 1,
      billingType: "SUBSCRIPTION",
    });
  });

  it("preserves V1 purchase-plan labels", () => {
    expect(commercePurchasePlanLabel("PERPETUAL")).toBe("Perpetual");
    expect(commercePurchasePlanLabel("MONTHLY")).toBe("Monthly");
    expect(commercePurchasePlanLabel("ANNUAL")).toBe("Annual");
  });
});
