export const COMMERCE_RENEWAL_CHECKOUT_PRICING_CAPABILITY_ID =
  "bke.commerce.renewal-checkout-pricing.v1" as const;

export interface CommercePrepareRenewalCheckoutInput {
  readonly orderId: string;
}

export type CommercePrepareRenewalCheckoutResult =
  | { readonly status: "READY"; readonly renewal: false }
  | {
      readonly status: "READY";
      readonly renewal: true;
      readonly subtotalMinor: number;
      readonly totalMinor: number;
      readonly scheduledOfferApplied: boolean;
    }
  | { readonly status: "REJECTED"; readonly code: "ORDER_NOT_FOUND" | "RENEWAL_NOT_ELIGIBLE" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface CommerceRenewalCheckoutPricingCapability {
  prepare(input: CommercePrepareRenewalCheckoutInput): Promise<CommercePrepareRenewalCheckoutResult>;
}
