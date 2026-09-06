import {
  COMMERCE_PRICING_VERSION,
  type CommercePurchasePlanPricingCapability,
  type CommercePurchasePlanPricingFailureCode,
  type CommercePurchasePlanPricingResult,
  type CommercePurchasePlanSnapshot,
} from "../contracts/purchase-plan-pricing.contract";
import { resolveCommercePurchasePlan } from "./pricing-policy";

export { ANNUAL_DISCOUNT_MAX_BPS, ANNUAL_DISCOUNT_MIN_BPS } from "./pricing-policy";

const failureCodes = new Set<CommercePurchasePlanPricingFailureCode>([
  "ANNUAL_MONTHLY_PLAN_REQUIRED",
  "INVALID_ANNUAL_DISCOUNT",
  "INVALID_MONTHLY_AMOUNT",
  "INVALID_PLAN_AMOUNT",
  "MONEY_OVERFLOW",
  "PLAN_AMOUNT_REQUIRED",
]);

function failureCode(error: unknown): CommercePurchasePlanPricingFailureCode {
  const code = error instanceof Error ? error.message : "";
  return failureCodes.has(code as CommercePurchasePlanPricingFailureCode)
    ? (code as CommercePurchasePlanPricingFailureCode)
    : "MONEY_OVERFLOW";
}

export function createCommercePurchasePlanPricingCapability(): CommercePurchasePlanPricingCapability {
  return Object.freeze({
    resolve(plan: CommercePurchasePlanSnapshot): CommercePurchasePlanPricingResult {
      try {
        return {
          status: "RESOLVED",
          pricingVersion: COMMERCE_PRICING_VERSION,
          pricing: resolveCommercePurchasePlan(plan),
        };
      } catch (error) {
        return { status: "FAILED", code: failureCode(error) };
      }
    },
  });
}
