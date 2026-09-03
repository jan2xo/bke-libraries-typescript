export const COMMERCE_OFFER_REDEMPTION_CAPABILITY_ID =
  "bke.commerce.offer-redemption.v1" as const;

export type CommerceDiscountType =
  | "GENERAL_PROMOTION"
  | "CUSTOMER_ACCOUNT_OFFER"
  | "ADMINISTRATIVE_ADJUSTMENT";

export type CommerceOfferRedemptionStatus =
  | "RESERVED"
  | "APPLIED"
  | "RELEASED"
  | "REFUNDED";

export interface CommerceOfferRedemptionSnapshot {
  readonly id: string;
  readonly offerId: string;
  readonly accountId: string;
  readonly orderId: string;
  readonly status: CommerceOfferRedemptionStatus;
  readonly discountBps: number;
  readonly discountedBillingCycles: number | null;
  readonly baseMinor: number;
  readonly discountMinor: number;
  readonly finalMinor: number;
  readonly currency: string;
  readonly pricingVersion: string;
  readonly reservedAt: Date;
  readonly appliedAt: Date | null;
  readonly releasedAt: Date | null;
}

export interface CommerceReserveOfferRedemptionInput {
  readonly code: string;
  readonly accountId: string;
  readonly orderId: string;
  readonly productId?: string | null;
  readonly editionId?: string | null;
  readonly purchasePlanId?: string | null;
  readonly baseMinor: number;
  readonly currency: string;
  readonly pricingVersion: string;
}

export type CommerceReserveOfferRedemptionResult =
  | {
      readonly status: "RESERVED";
      readonly redemption: CommerceOfferRedemptionSnapshot;
      readonly idempotent: boolean;
    }
  | {
      readonly status: "REJECTED";
      readonly code:
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

export type CommerceOfferRedemptionTransition = "APPLY" | "RELEASE" | "REFUND";

export type CommerceTransitionOfferRedemptionResult =
  | { readonly status: "UPDATED"; readonly redemption: CommerceOfferRedemptionSnapshot }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "REJECTED"; readonly code: "INVALID_TRANSITION" }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface CommerceOfferRedemptionCapability {
  reserve(input: CommerceReserveOfferRedemptionInput): Promise<CommerceReserveOfferRedemptionResult>;
  transition(input: {
    readonly redemptionId: string;
    readonly transition: CommerceOfferRedemptionTransition;
  }): Promise<CommerceTransitionOfferRedemptionResult>;
}
