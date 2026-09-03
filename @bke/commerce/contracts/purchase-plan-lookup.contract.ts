import type {
  CommerceBillingType,
  CommerceIntervalUnit,
  CommercePurchasePlanSnapshot,
} from "./purchase-plan-pricing.contract";

export const COMMERCE_PURCHASE_PLAN_LOOKUP_CAPABILITY_ID =
  "bke.commerce.purchase-plan-lookup.v1" as const;

export interface CommerceLegacyPriceSnapshot {
  readonly id: string;
  readonly productId: string;
  readonly licensePolicyId: string;
  readonly name: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly billingType: CommerceBillingType;
  readonly intervalUnit: CommerceIntervalUnit;
  readonly intervalCount: number | null;
  readonly active: boolean;
}

export interface CommercePurchasePlanLookupSnapshot extends CommercePurchasePlanSnapshot {
  readonly active: boolean;
  readonly legacyPriceId: string | null;
  readonly legacyPrice: CommerceLegacyPriceSnapshot | null;
}

export type CommercePurchasePlanLookupResult =
  | { readonly status: "FOUND"; readonly plan: CommercePurchasePlanLookupSnapshot }
  | { readonly status: "NOT_FOUND" }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface CommercePurchasePlanLookupCapability {
  find(input: { readonly planId: string }): Promise<CommercePurchasePlanLookupResult>;
}
