import type { CommercePurchasePlanLookupSnapshot } from "../contracts/purchase-plan-lookup.contract";

export interface CommercePurchasePlanLookupRepository {
  findById(planId: string): Promise<CommercePurchasePlanLookupSnapshot | null>;
}
