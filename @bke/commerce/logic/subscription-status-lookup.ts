import type { CommerceSubscriptionStatusLookupCapability, CommerceSubscriptionStatusLookupResult } from "../contracts/subscription-status-lookup.contract";
import type { CommerceSubscriptionStatusLookupRepository } from "./subscription-status-lookup-repository";

export function createCommerceSubscriptionStatusLookupCapability(
  repository: CommerceSubscriptionStatusLookupRepository,
): CommerceSubscriptionStatusLookupCapability {
  return Object.freeze({
    async find(input: { readonly subscriptionId: string }): Promise<CommerceSubscriptionStatusLookupResult> {
      const trimmed = input.subscriptionId.trim();
      if (!trimmed || input.subscriptionId.length > 256) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const subscription = await repository.findById(input.subscriptionId);
        return subscription ? { status: "FOUND", subscription } : { status: "NOT_FOUND" };
      } catch { return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" }; }
    },
  });
}
