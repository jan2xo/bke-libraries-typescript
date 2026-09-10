import type {
  CommercePublicPromotionPreviewCapability,
  CommercePublicPromotionPreviewInput,
  CommercePublicPromotionPreviewResult,
} from "../contracts/public-promotion-preview.contract";
import { calculateCommerceOfferDiscount } from "./offer-redemption";
import type { CommercePublicPromotionPreviewRepository } from "./public-promotion-preview-repository";

function validId(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 256;
}

function validInput(input: CommercePublicPromotionPreviewInput): boolean {
  return (
    validId(input.productId) &&
    validId(input.editionId) &&
    validId(input.purchasePlanId) &&
    ["PERPETUAL", "MONTHLY", "ANNUAL"].includes(input.planType) &&
    Number.isSafeInteger(input.baseMinor) &&
    input.baseMinor >= 1
  );
}

export function createCommercePublicPromotionPreviewCapability(
  repository: CommercePublicPromotionPreviewRepository,
  now: () => Date = () => new Date(),
): CommercePublicPromotionPreviewCapability {
  return Object.freeze({
    async preview(input: CommercePublicPromotionPreviewInput): Promise<CommercePublicPromotionPreviewResult> {
      if (!validInput(input)) return { status: "FAILED", code: "INVALID_INPUT" };
      const timestamp = now();
      if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        const offer = await repository.findBest({
          productId: input.productId.trim(),
          editionId: input.editionId.trim(),
          purchasePlanId: input.purchasePlanId.trim(),
          planType: input.planType,
          baseMinor: input.baseMinor,
          now: timestamp,
        });
        if (!offer) return { status: "NONE" };
        const discount = calculateCommerceOfferDiscount({
          baseMinor: input.baseMinor,
          discountBps: offer.discountBps,
        });
        return {
          status: "PRICED",
          value: Object.freeze({
            offerId: offer.offerId,
            name: offer.name,
            discountBps: offer.discountBps,
            discountedBillingCycles: offer.discountedBillingCycles,
            discountMinor: discount.discountMinor,
            finalMinor: discount.finalMinor,
          }),
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
