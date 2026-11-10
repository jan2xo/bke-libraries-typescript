import { describe, expect, it } from "vitest";
import {
  COMMERCE_PRICING_VERSION,
  type CommercePurchasePlanSnapshot,
} from "../contracts/purchase-plan-pricing.contract";
import { createCommercePurchasePlanPricingCapability } from "../logic/purchase-plan-pricing";

const pricing = createCommercePurchasePlanPricingCapability();

function plan(
  overrides: Partial<CommercePurchasePlanSnapshot> = {},
): CommercePurchasePlanSnapshot {
  return {
    id: "plan-1",
    editionId: "edition-1",
    type: "MONTHLY",
    currency: "PHP",
    amountMinor: 100_000,
    annualDiscountBps: null,
    renewalBehavior: "CUSTOMER_AUTHORIZED",
    monthlySource: null,
    ...overrides,
  };
}

describe("Commerce purchase-plan pricing", () => {
  it("preserves V1 perpetual pricing semantics", () => {
    expect(
      pricing.resolve(
        plan({ type: "PERPETUAL", amountMinor: 300_000, renewalBehavior: "NONE" }),
      ),
    ).toEqual({
      status: "RESOLVED",
      pricingVersion: COMMERCE_PRICING_VERSION,
      pricing: {
        amountMinor: 300_000,
        intervalUnit: null,
        intervalCount: null,
        billingType: "ONE_TIME",
        monthlyAmountMinor: null,
        discountBps: 0,
        grossAnnualMinor: null,
        annualAmountMinor: null,
        savingsMinor: 0,
        effectiveMonthlyMinor: null,
      },
    });
  });

  it("preserves V1 monthly pricing semantics", () => {
    expect(pricing.resolve(plan({ amountMinor: 25_000 }))).toEqual({
      status: "RESOLVED",
      pricingVersion: COMMERCE_PRICING_VERSION,
      pricing: {
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
      },
    });
  });

  it("derives annual price from the active monthly source with half-up rounding", () => {
    expect(
      pricing.resolve(
        plan({
          type: "ANNUAL",
          amountMinor: null,
          annualDiscountBps: 1_000,
          monthlySource: {
            active: true,
            amountMinor: 1_001,
            type: "MONTHLY",
            editionId: "edition-1",
          },
        }),
      ),
    ).toEqual({
      status: "RESOLVED",
      pricingVersion: COMMERCE_PRICING_VERSION,
      pricing: {
        amountMinor: 10_811,
        intervalUnit: "YEAR",
        intervalCount: 1,
        billingType: "SUBSCRIPTION",
        monthlyAmountMinor: 1_001,
        discountBps: 1_000,
        grossAnnualMinor: 12_012,
        annualAmountMinor: 10_811,
        savingsMinor: 1_201,
        effectiveMonthlyMinor: 901,
      },
    });
  });

  it.each([
    null,
    { active: false, amountMinor: 1_000, type: "MONTHLY" as const, editionId: "edition-1" },
    { active: true, amountMinor: null, type: "MONTHLY" as const, editionId: "edition-1" },
    { active: true, amountMinor: 1_000, type: "PERPETUAL" as const, editionId: "edition-1" },
    { active: true, amountMinor: 1_000, type: "MONTHLY" as const, editionId: "edition-2" },
  ])("requires a compatible active monthly source for annual pricing", (monthlySource) => {
    expect(
      pricing.resolve(
        plan({ type: "ANNUAL", amountMinor: null, annualDiscountBps: 500, monthlySource }),
      ),
    ).toEqual({ status: "FAILED", code: "ANNUAL_MONTHLY_PLAN_REQUIRED" });
  });

  it("rejects invalid annual discounts using the V1 0..1000 bps policy", () => {
    expect(
      pricing.resolve(
        plan({
          type: "ANNUAL",
          amountMinor: null,
          annualDiscountBps: 1_001,
          monthlySource: {
            active: true,
            amountMinor: 1_000,
            type: "MONTHLY",
            editionId: "edition-1",
          },
        }),
      ),
    ).toEqual({ status: "FAILED", code: "INVALID_ANNUAL_DISCOUNT" });
  });

  it("distinguishes a missing amount from an invalid non-annual amount", () => {
    expect(pricing.resolve(plan({ amountMinor: null }))).toEqual({
      status: "FAILED",
      code: "PLAN_AMOUNT_REQUIRED",
    });
    expect(pricing.resolve(plan({ amountMinor: 0 }))).toEqual({
      status: "FAILED",
      code: "INVALID_PLAN_AMOUNT",
    });
  });

  it("preserves V1 invalid-monthly-amount and overflow failures", () => {
    expect(
      pricing.resolve(
        plan({
          type: "ANNUAL",
          amountMinor: null,
          monthlySource: {
            active: true,
            amountMinor: 0,
            type: "MONTHLY",
            editionId: "edition-1",
          },
        }),
      ),
    ).toEqual({ status: "FAILED", code: "INVALID_MONTHLY_AMOUNT" });

    expect(
      pricing.resolve(
        plan({
          type: "ANNUAL",
          amountMinor: null,
          monthlySource: {
            active: true,
            amountMinor: Number.MAX_SAFE_INTEGER,
            type: "MONTHLY",
            editionId: "edition-1",
          },
        }),
      ),
    ).toEqual({ status: "FAILED", code: "MONEY_OVERFLOW" });
  });

  it("derives six calendar months from the same monthly source with independent 0–10% discount", () => {
    const source = { active: true, amountMinor: 1_001, type: "MONTHLY" as const,
      editionId: "edition-1", currency: "PHP" };
    const resolve = (discount: number | null) => pricing.resolve(plan({
      type: "SEMI_ANNUAL", amountMinor: null,
      annualDiscountBps: 1_000, semiAnnualDiscountBps: discount,
      monthlySource: source,
    }));
    expect(resolve(0)).toMatchObject({ status: "RESOLVED", pricing: {
      amountMinor: 6_006, intervalUnit: "MONTH", intervalCount: 6,
      discountBps: 0, grossSemiAnnualMinor: 6_006, semiAnnualAmountMinor: 6_006,
      savingsMinor: 0, effectiveMonthlyMinor: 1_001,
    } });
    expect(resolve(500)).toMatchObject({ status: "RESOLVED", pricing: {
      amountMinor: 5_706, discountBps: 500, savingsMinor: 300,
      effectiveMonthlyMinor: 951,
    } });
    expect(resolve(1_000)).toMatchObject({ status: "RESOLVED", pricing: {
      amountMinor: 5_405, discountBps: 1_000, savingsMinor: 601,
    } });
    expect(resolve(null)).toEqual({ status: "FAILED", code: "SEMI_ANNUAL_DISCOUNT_REQUIRED" });
    for (const invalid of [-1, 1_001, 1.5, Number.NaN]) {
      expect(resolve(invalid)).toEqual({ status: "FAILED", code: "INVALID_SEMI_ANNUAL_DISCOUNT" });
    }
  });

  it("rejects disabled, foreign-edition, cross-currency and invalid monthly sources", () => {
    const input = (monthlySource: CommercePurchasePlanSnapshot["monthlySource"]) =>
      pricing.resolve(plan({
        type: "SEMI_ANNUAL", amountMinor: null, semiAnnualDiscountBps: 0,
        monthlySource,
      }));
    expect(input(null)).toEqual({ status: "FAILED", code: "SEMI_ANNUAL_MONTHLY_PLAN_REQUIRED" });
    for (const source of [
      { active: false, amountMinor: 1_000, type: "MONTHLY" as const, editionId: "edition-1" },
      { active: true, amountMinor: 1_000, type: "ANNUAL" as const, editionId: "edition-1" },
      { active: true, amountMinor: 1_000, type: "MONTHLY" as const, editionId: "edition-2" },
      { active: true, amountMinor: 1_000, type: "MONTHLY" as const, editionId: "edition-1", currency: "USD" },
    ]) expect(input(source)).toEqual({ status: "FAILED", code: "SEMI_ANNUAL_MONTHLY_PLAN_REQUIRED" });
    expect(input({ active: true, amountMinor: 0, type: "MONTHLY", editionId: "edition-1" }))
      .toEqual({ status: "FAILED", code: "INVALID_MONTHLY_AMOUNT" });
    expect(input({ active: true, amountMinor: Number.MAX_SAFE_INTEGER, type: "MONTHLY", editionId: "edition-1" }))
      .toEqual({ status: "FAILED", code: "MONEY_OVERFLOW" });
    expect(input({ active: true, amountMinor: 1_000_000_000, type: "MONTHLY", editionId: "edition-1" }))
      .toEqual({ status: "FAILED", code: "MONEY_OVERFLOW" });
  });


});
