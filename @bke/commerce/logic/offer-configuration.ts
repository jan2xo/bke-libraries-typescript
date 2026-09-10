export type CommerceOfferConfigurationType =
  | "GENERAL_PROMOTION"
  | "CUSTOMER_ACCOUNT_OFFER"
  | "ADMINISTRATIVE_ADJUSTMENT";

export type CommerceOfferConfigurationPlanType = "PERPETUAL" | "MONTHLY" | "ANNUAL";

export type CommerceOfferConfigurationFailureCode =
  | "INVALID_OFFER_DISCOUNT"
  | "OFFER_ACCOUNT_REQUIRED"
  | "INVALID_PROMOTIONAL_DURATION"
  | "ZERO_TOTAL_REQUIRES_FULL_DISCOUNT";

export interface CommerceOfferConfigurationInput {
  readonly type: CommerceOfferConfigurationType | string;
  readonly discountBps: number;
  readonly customerAccountId?: string | null;
  readonly discountedBillingCycles?: number | null;
  readonly purchasePlanType?: CommerceOfferConfigurationPlanType | null;
  readonly allowZeroTotal?: boolean;
}

export type CommerceOfferConfigurationResult =
  | { readonly status: "VALID" }
  | { readonly status: "REJECTED"; readonly code: CommerceOfferConfigurationFailureCode };

export function validateCommerceOfferConfiguration(
  input: CommerceOfferConfigurationInput,
): CommerceOfferConfigurationResult {
  if (!Number.isInteger(input.discountBps) || input.discountBps < 0 || input.discountBps > 10_000) {
    return { status: "REJECTED", code: "INVALID_OFFER_DISCOUNT" };
  }
  if (
    (input.type === "CUSTOMER_ACCOUNT_OFFER" || input.type === "ADMINISTRATIVE_ADJUSTMENT") &&
    !input.customerAccountId
  ) {
    return { status: "REJECTED", code: "OFFER_ACCOUNT_REQUIRED" };
  }
  if (input.discountedBillingCycles !== null && input.discountedBillingCycles !== undefined) {
    if (
      !Number.isInteger(input.discountedBillingCycles) ||
      input.discountedBillingCycles < 1 ||
      input.discountedBillingCycles > 12 ||
      (input.purchasePlanType !== null &&
        input.purchasePlanType !== undefined &&
        input.purchasePlanType !== "MONTHLY")
    ) {
      return { status: "REJECTED", code: "INVALID_PROMOTIONAL_DURATION" };
    }
  }
  if (input.allowZeroTotal && input.discountBps !== 10_000) {
    return { status: "REJECTED", code: "ZERO_TOTAL_REQUIRES_FULL_DISCOUNT" };
  }
  return { status: "VALID" };
}
