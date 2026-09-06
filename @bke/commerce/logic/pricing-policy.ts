import type {
  CommercePurchasePlanSnapshot,
  CommercePurchasePlanType,
  CommerceResolvedPurchasePlanPricing,
} from "../contracts/purchase-plan-pricing.contract";

export const ANNUAL_DISCOUNT_MIN_BPS = 0;
export const ANNUAL_DISCOUNT_MAX_BPS = 1_000;
export const OFFER_DISCOUNT_MIN_BPS = 0;
export const OFFER_DISCOUNT_MAX_BPS = 10_000;

export type CommerceAnnualPricing = {
  readonly monthlyAmountMinor: number;
  readonly discountBps: number;
  readonly grossAnnualMinor: number;
  readonly annualAmountMinor: number;
  readonly savingsMinor: number;
  readonly effectiveMonthlyMinor: number;
};

function assertMinorUnits(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`INVALID_${field}`);
}

export function roundCommerceRatioHalfUp(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n || numerator < 0n) throw new Error("INVALID_MONEY_RATIO");
  const rounded = (numerator + denominator / 2n) / denominator;
  const value = Number(rounded);
  if (!Number.isSafeInteger(value)) throw new Error("MONEY_OVERFLOW");
  return value;
}

export function calculateCommerceAnnualPricing(
  monthlyAmountMinor: number,
  discountBps: number,
): CommerceAnnualPricing {
  assertMinorUnits(monthlyAmountMinor, "MONTHLY_AMOUNT");
  if (
    !Number.isInteger(discountBps) ||
    discountBps < ANNUAL_DISCOUNT_MIN_BPS ||
    discountBps > ANNUAL_DISCOUNT_MAX_BPS
  ) {
    throw new Error("INVALID_ANNUAL_DISCOUNT");
  }
  const grossAnnualMinor = monthlyAmountMinor * 12;
  if (!Number.isSafeInteger(grossAnnualMinor)) throw new Error("MONEY_OVERFLOW");
  const annualAmountMinor = roundCommerceRatioHalfUp(
    BigInt(grossAnnualMinor) * BigInt(10_000 - discountBps),
    10_000n,
  );
  return {
    monthlyAmountMinor,
    discountBps,
    grossAnnualMinor,
    annualAmountMinor,
    savingsMinor: grossAnnualMinor - annualAmountMinor,
    effectiveMonthlyMinor: roundCommerceRatioHalfUp(BigInt(annualAmountMinor), 12n),
  };
}

export function applyCommerceOfferDiscount(catalogAmountMinor: number, discountBps: number) {
  assertMinorUnits(catalogAmountMinor, "CATALOG_AMOUNT");
  if (
    !Number.isInteger(discountBps) ||
    discountBps < OFFER_DISCOUNT_MIN_BPS ||
    discountBps > OFFER_DISCOUNT_MAX_BPS
  ) {
    throw new Error("INVALID_OFFER_DISCOUNT");
  }
  const finalAmountMinor = roundCommerceRatioHalfUp(
    BigInt(catalogAmountMinor) * BigInt(10_000 - discountBps),
    10_000n,
  );
  if (finalAmountMinor < 0 || finalAmountMinor > catalogAmountMinor) {
    throw new Error("INVALID_DISCOUNTED_AMOUNT");
  }
  return {
    catalogAmountMinor,
    discountBps,
    discountAmountMinor: catalogAmountMinor - finalAmountMinor,
    finalAmountMinor,
  };
}

export function resolveCommercePurchasePlan(plan: CommercePurchasePlanSnapshot): CommerceResolvedPurchasePlanPricing {
  if (plan.type === "ANNUAL") {
    if (
      !plan.monthlySource?.active ||
      plan.monthlySource.amountMinor === null ||
      plan.monthlySource.type !== "MONTHLY" ||
      (plan.editionId && plan.monthlySource.editionId !== plan.editionId)
    ) {
      throw new Error("ANNUAL_MONTHLY_PLAN_REQUIRED");
    }
    const pricing = calculateCommerceAnnualPricing(
      plan.monthlySource.amountMinor,
      plan.annualDiscountBps ?? 0,
    );
    return {
      ...pricing,
      amountMinor: pricing.annualAmountMinor,
      intervalUnit: "YEAR",
      intervalCount: 1,
      billingType: "SUBSCRIPTION",
    };
  }

  if (plan.amountMinor === null) throw new Error("PLAN_AMOUNT_REQUIRED");
  assertMinorUnits(plan.amountMinor, "PLAN_AMOUNT");
  return {
    amountMinor: plan.amountMinor,
    intervalUnit: plan.type === "MONTHLY" ? "MONTH" : null,
    intervalCount: plan.type === "MONTHLY" ? 1 : null,
    billingType: plan.type === "PERPETUAL" ? "ONE_TIME" : "SUBSCRIPTION",
    monthlyAmountMinor: plan.type === "MONTHLY" ? plan.amountMinor : null,
    discountBps: 0,
    grossAnnualMinor: null,
    annualAmountMinor: null,
    savingsMinor: 0,
    effectiveMonthlyMinor: plan.type === "MONTHLY" ? plan.amountMinor : null,
  };
}

export function commercePurchasePlanLabel(type: CommercePurchasePlanType): string {
  return type === "PERPETUAL" ? "Perpetual" : type === "MONTHLY" ? "Monthly" : "Annual";
}
