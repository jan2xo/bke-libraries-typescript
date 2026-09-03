import {
  COMMERCE_PRICING_VERSION,
  type CommercePurchasePlanPricingCapability,
  type CommercePurchasePlanPricingFailureCode,
  type CommercePurchasePlanPricingResult,
  type CommercePurchasePlanSnapshot,
  type CommerceResolvedPurchasePlanPricing,
} from "../contracts/purchase-plan-pricing.contract";

export const ANNUAL_DISCOUNT_MIN_BPS = 0;
export const ANNUAL_DISCOUNT_MAX_BPS = 1_000;

function failure(code: CommercePurchasePlanPricingFailureCode): CommercePurchasePlanPricingResult {
  return { status: "FAILED", code };
}

function validMinorUnits(value: number) {
  return Number.isSafeInteger(value) && value >= 1;
}

function roundRatioHalfUp(numerator: bigint, denominator: bigint): number | null {
  if (denominator <= 0n || numerator < 0n) return null;
  const rounded = (numerator + denominator / 2n) / denominator;
  const value = Number(rounded);
  return Number.isSafeInteger(value) ? value : null;
}

function resolveAnnual(
  plan: CommercePurchasePlanSnapshot,
): CommercePurchasePlanPricingResult {
  const monthlySource = plan.monthlySource;
  if (
    !monthlySource?.active ||
    monthlySource.amountMinor === null ||
    monthlySource.type !== "MONTHLY" ||
    (plan.editionId && monthlySource.editionId !== plan.editionId)
  ) {
    return failure("ANNUAL_MONTHLY_PLAN_REQUIRED");
  }

  if (!validMinorUnits(monthlySource.amountMinor)) {
    return failure("INVALID_MONTHLY_AMOUNT");
  }

  const discountBps = plan.annualDiscountBps ?? 0;
  if (
    !Number.isInteger(discountBps) ||
    discountBps < ANNUAL_DISCOUNT_MIN_BPS ||
    discountBps > ANNUAL_DISCOUNT_MAX_BPS
  ) {
    return failure("INVALID_ANNUAL_DISCOUNT");
  }

  const grossAnnualMinor = monthlySource.amountMinor * 12;
  if (!Number.isSafeInteger(grossAnnualMinor)) {
    return failure("MONEY_OVERFLOW");
  }

  const annualAmountMinor = roundRatioHalfUp(
    BigInt(grossAnnualMinor) * BigInt(10_000 - discountBps),
    10_000n,
  );
  if (annualAmountMinor === null) {
    return failure("MONEY_OVERFLOW");
  }

  const effectiveMonthlyMinor = roundRatioHalfUp(BigInt(annualAmountMinor), 12n);
  if (effectiveMonthlyMinor === null) {
    return failure("MONEY_OVERFLOW");
  }

  const pricing: CommerceResolvedPurchasePlanPricing = {
    amountMinor: annualAmountMinor,
    intervalUnit: "YEAR",
    intervalCount: 1,
    billingType: "SUBSCRIPTION",
    monthlyAmountMinor: monthlySource.amountMinor,
    discountBps,
    grossAnnualMinor,
    annualAmountMinor,
    savingsMinor: grossAnnualMinor - annualAmountMinor,
    effectiveMonthlyMinor,
  };

  return { status: "RESOLVED", pricingVersion: COMMERCE_PRICING_VERSION, pricing };
}

function resolveNonAnnual(
  plan: CommercePurchasePlanSnapshot,
): CommercePurchasePlanPricingResult {
  if (plan.amountMinor === null) {
    return failure("PLAN_AMOUNT_REQUIRED");
  }
  if (!validMinorUnits(plan.amountMinor)) {
    return failure("INVALID_PLAN_AMOUNT");
  }

  const monthly = plan.type === "MONTHLY";
  const pricing: CommerceResolvedPurchasePlanPricing = {
    amountMinor: plan.amountMinor,
    intervalUnit: monthly ? "MONTH" : null,
    intervalCount: monthly ? 1 : null,
    billingType: monthly ? "SUBSCRIPTION" : "ONE_TIME",
    monthlyAmountMinor: monthly ? plan.amountMinor : null,
    discountBps: 0,
    grossAnnualMinor: null,
    annualAmountMinor: null,
    savingsMinor: 0,
    effectiveMonthlyMinor: monthly ? plan.amountMinor : null,
  };

  return { status: "RESOLVED", pricingVersion: COMMERCE_PRICING_VERSION, pricing };
}

export function createCommercePurchasePlanPricingCapability(): CommercePurchasePlanPricingCapability {
  return Object.freeze({
    resolve(plan: CommercePurchasePlanSnapshot): CommercePurchasePlanPricingResult {
      return plan.type === "ANNUAL" ? resolveAnnual(plan) : resolveNonAnnual(plan);
    },
  });
}
