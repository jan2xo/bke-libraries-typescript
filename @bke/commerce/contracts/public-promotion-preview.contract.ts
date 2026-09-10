export const COMMERCE_PUBLIC_PROMOTION_PREVIEW_CAPABILITY_ID =
  "bke.commerce.public-promotion-preview.v1" as const;

export type CommercePublicPromotionPlanType = "PERPETUAL" | "MONTHLY" | "ANNUAL";

export interface CommercePublicPromotionPreviewInput {
  readonly productId: string;
  readonly editionId: string;
  readonly purchasePlanId: string;
  readonly planType: CommercePublicPromotionPlanType;
  readonly baseMinor: number;
}

export interface CommercePublicPromotionPreviewSnapshot {
  readonly offerId: string;
  readonly name: string;
  readonly discountBps: number;
  readonly discountedBillingCycles: number | null;
  readonly discountMinor: number;
  readonly finalMinor: number;
}

export type CommercePublicPromotionPreviewResult =
  | { readonly status: "PRICED"; readonly value: CommercePublicPromotionPreviewSnapshot }
  | { readonly status: "NONE" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface CommercePublicPromotionPreviewCapability {
  preview(input: CommercePublicPromotionPreviewInput): Promise<CommercePublicPromotionPreviewResult>;
}
