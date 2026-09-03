import type {
  CommerceCheckoutOfferPricingCapability,
  CommercePriceCheckoutOfferInput,
  CommercePriceCheckoutOfferResult,
} from "../contracts/checkout-offer-pricing.contract";
import type { CommerceCheckoutOfferPricingRepository } from "./checkout-offer-pricing-repository";

function validId(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 256;
}

function validOptionalIdentifier(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 256;
}

export function createCommerceCheckoutOfferPricingCapability(
  repository: CommerceCheckoutOfferPricingRepository,
  now: () => Date = () => new Date(),
): CommerceCheckoutOfferPricingCapability {
  return Object.freeze({
    async price(input: CommercePriceCheckoutOfferInput): Promise<CommercePriceCheckoutOfferResult> {
      if (!validId(input.orderId) || !validOptionalIdentifier(input.offerIdentifier)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const timestamp = now();
      if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        return await repository.price({
          orderId: input.orderId.trim(),
          offerIdentifier: input.offerIdentifier?.trim() || null,
          now: timestamp,
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
