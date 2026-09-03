export const COMMERCE_CHECKOUT_OFFER_PRICING_CAPABILITY_ID =
  "bke.commerce.checkout-offer-pricing.v1" as const;

export type CommerceCheckoutOfferType =
  | "GENERAL_PROMOTION"
  | "CUSTOMER_ACCOUNT_OFFER"
  | "ADMINISTRATIVE_ADJUSTMENT";

export type CommerceCheckoutOfferScope =
  | "PURCHASE_PLAN"
  | "EDITION"
  | "PRODUCT"
  | "CUSTOMER_ACCOUNT"
  | "ALL_ELIGIBLE";

export interface CommerceCheckoutOfferSnapshot {
  readonly redemptionId: string;
  readonly offerId: string;
  readonly name: string;
  readonly code: string | null;
  readonly type: CommerceCheckoutOfferType;
  readonly scope: CommerceCheckoutOfferScope;
  readonly discountBps: number;
  readonly discountMinor: number;
  readonly finalMinor: number;
  readonly discountedBillingCycles: number | null;
}

export interface CommerceCheckoutOfferPricingSnapshot {
  readonly orderId: string;
  readonly subtotalMinor: number;
  readonly totalMinor: number;
  readonly offer: CommerceCheckoutOfferSnapshot | null;
}

export interface CommercePriceCheckoutOfferInput {
  readonly orderId: string;
  readonly offerIdentifier?: string | null;
}

export type CommercePriceCheckoutOfferResult =
  | {
      readonly status: "PRICED";
      readonly value: CommerceCheckoutOfferPricingSnapshot;
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "ORDER_NOT_FOUND"
        | "ORDER_NOT_ELIGIBLE"
        | "OFFER_NOT_FOUND"
        | "OFFER_INACTIVE"
        | "OFFER_NOT_STARTED"
        | "OFFER_EXPIRED"
        | "OFFER_SCOPE_MISMATCH"
        | "GLOBAL_LIMIT_REACHED"
        | "ACCOUNT_LIMIT_REACHED"
        | "ZERO_TOTAL_NOT_ALLOWED";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface CommerceCheckoutOfferPricingCapability {
  price(input: CommercePriceCheckoutOfferInput): Promise<CommercePriceCheckoutOfferResult>;
}
