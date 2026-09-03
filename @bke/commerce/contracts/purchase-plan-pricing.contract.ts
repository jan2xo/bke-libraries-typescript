export const COMMERCE_PURCHASE_PLAN_PRICING_CAPABILITY_ID =
  "bke.commerce.purchase-plan-pricing.v1" as const;

export const COMMERCE_PRICING_VERSION = "OFFER_V1" as const;

export type CommercePurchasePlanType = "PERPETUAL" | "MONTHLY" | "ANNUAL";
export type CommerceRenewalBehavior = "NONE" | "CUSTOMER_AUTHORIZED";
export type CommerceBillingType = "ONE_TIME" | "SUBSCRIPTION";
export type CommerceIntervalUnit = "MONTH" | "YEAR" | null;

export interface CommerceMonthlySourcePlanSnapshot {
  readonly amountMinor: number | null;
  readonly active: boolean;
  readonly type?: CommercePurchasePlanType;
  readonly editionId?: string;
}

export interface CommercePurchasePlanSnapshot {
  readonly id: string;
  readonly editionId?: string;
  readonly type: CommercePurchasePlanType;
  readonly currency: string;
  readonly amountMinor: number | null;
  readonly annualDiscountBps: number | null;
  readonly renewalBehavior: CommerceRenewalBehavior;
  readonly monthlySource?: CommerceMonthlySourcePlanSnapshot | null;
}

export interface CommerceResolvedPurchasePlanPricing {
  readonly amountMinor: number;
  readonly intervalUnit: CommerceIntervalUnit;
  readonly intervalCount: number | null;
  readonly billingType: CommerceBillingType;
  readonly monthlyAmountMinor: number | null;
  readonly discountBps: number;
  readonly grossAnnualMinor: number | null;
  readonly annualAmountMinor: number | null;
  readonly savingsMinor: number;
  readonly effectiveMonthlyMinor: number | null;
}

export type CommercePurchasePlanPricingFailureCode =
  | "ANNUAL_MONTHLY_PLAN_REQUIRED"
  | "INVALID_ANNUAL_DISCOUNT"
  | "INVALID_MONTHLY_AMOUNT"
  | "INVALID_PLAN_AMOUNT"
  | "MONEY_OVERFLOW"
  | "PLAN_AMOUNT_REQUIRED";

export type CommercePurchasePlanPricingResult =
  | {
      readonly status: "RESOLVED";
      readonly pricingVersion: typeof COMMERCE_PRICING_VERSION;
      readonly pricing: CommerceResolvedPurchasePlanPricing;
    }
  | {
      readonly status: "FAILED";
      readonly code: CommercePurchasePlanPricingFailureCode;
    };

export interface CommercePurchasePlanPricingCapability {
  resolve(plan: CommercePurchasePlanSnapshot): CommercePurchasePlanPricingResult;
}
