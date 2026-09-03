import type {
  CommercePurchasePlanLookupCapability,
  CommercePurchasePlanLookupResult,
} from "../contracts/purchase-plan-lookup.contract";
import type { CommercePurchasePlanLookupRepository } from "./purchase-plan-lookup-repository";

export function createCommercePurchasePlanLookupCapability(
  repository: CommercePurchasePlanLookupRepository,
): CommercePurchasePlanLookupCapability {
  return Object.freeze({
    async find(input: { readonly planId: string }): Promise<CommercePurchasePlanLookupResult> {
      const planId = input.planId.trim();
      if (!planId || planId.length > 256) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        const plan = await repository.findById(planId);
        return plan ? { status: "FOUND", plan } : { status: "NOT_FOUND" };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
