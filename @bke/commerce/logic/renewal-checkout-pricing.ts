import type {
  CommercePrepareRenewalCheckoutInput,
  CommercePrepareRenewalCheckoutResult,
  CommerceRenewalCheckoutPricingCapability,
} from "../contracts/renewal-checkout-pricing.contract";
import type { CommerceRenewalCheckoutPricingRepository } from "./renewal-checkout-pricing-repository";

export function createCommerceRenewalCheckoutPricingCapability(
  repository: CommerceRenewalCheckoutPricingRepository,
): CommerceRenewalCheckoutPricingCapability {
  return Object.freeze({
    async prepare(input: CommercePrepareRenewalCheckoutInput): Promise<CommercePrepareRenewalCheckoutResult> {
      const orderId = input.orderId.trim();
      if (!orderId || orderId.length > 256) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        return await repository.prepare(orderId);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
