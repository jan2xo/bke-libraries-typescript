import type {
  CommercePublicPromotionPlanType,
  CommercePublicPromotionPreviewInput,
} from "../contracts/public-promotion-preview.contract";

export interface CommercePublicPromotionCandidate {
  readonly offerId: string;
  readonly name: string;
  readonly discountBps: number;
  readonly discountedBillingCycles: number | null;
}

export interface CommercePublicPromotionPreviewRequest extends CommercePublicPromotionPreviewInput {
  readonly productId: string;
  readonly editionId: string;
  readonly purchasePlanId: string;
  readonly planType: CommercePublicPromotionPlanType;
  readonly baseMinor: number;
  readonly now: Date;
}

export interface CommercePublicPromotionPreviewRepository {
  findBest(input: CommercePublicPromotionPreviewRequest): Promise<CommercePublicPromotionCandidate | null>;
}
