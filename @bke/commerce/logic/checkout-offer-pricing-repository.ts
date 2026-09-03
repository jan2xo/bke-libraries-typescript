import type {
  CommerceCheckoutOfferPricingSnapshot,
  CommercePriceCheckoutOfferResult,
} from "../contracts/checkout-offer-pricing.contract";

export interface CommerceCheckoutOfferPricingRequest {
  readonly orderId: string;
  readonly offerIdentifier: string | null;
  readonly now: Date;
}

export interface CommerceCheckoutOfferPricingRepository {
  price(input: CommerceCheckoutOfferPricingRequest): Promise<CommercePriceCheckoutOfferResult>;
}

export type { CommerceCheckoutOfferPricingSnapshot };
