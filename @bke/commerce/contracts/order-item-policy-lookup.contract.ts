export const COMMERCE_ORDER_ITEM_POLICY_LOOKUP_CAPABILITY_ID = "bke.commerce.order-item-policy-lookup.v1" as const;

export interface CommerceOrderItemPolicySnapshot {
  readonly orderItemId: string;
  readonly policyId: string;
}

export type CommerceOrderItemPolicyLookupResult =
  | { readonly status: "FOUND"; readonly value: CommerceOrderItemPolicySnapshot }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface CommerceOrderItemPolicyLookupCapability {
  findByOrderItemId(orderItemId: string): Promise<CommerceOrderItemPolicyLookupResult>;
}
