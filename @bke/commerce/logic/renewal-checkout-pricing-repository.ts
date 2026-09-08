import type { CommercePrepareRenewalCheckoutResult } from "../contracts/renewal-checkout-pricing.contract";

export interface CommerceRenewalCheckoutPricingRepository {
  prepare(orderId: string): Promise<CommercePrepareRenewalCheckoutResult>;
}
