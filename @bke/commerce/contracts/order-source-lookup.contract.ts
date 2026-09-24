export const COMMERCE_ORDER_SOURCE_LOOKUP_CAPABILITY_ID =
  "bke.commerce.order-source-lookup.v1" as const;

export interface CommerceFindOrderBySourceInput {
  readonly sourceReference: string;
}

export interface CommerceOrderSourceSnapshot {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly accountId: string;
  readonly sourceReference: string;
  readonly fulfillmentMode: "ACCOUNT_ENTITLEMENT" | "CLAIM_CODE";
  readonly status: "PENDING" | "PAID" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  readonly currency: string;
  readonly totalMinor: number;
  readonly paidAt: Date | null;
  readonly createdAt: Date;
}

export type CommerceFindOrderBySourceResult =
  | { readonly status: "FOUND"; readonly value: CommerceOrderSourceSnapshot }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface CommerceOrderSourceLookupCapability {
  find(input: CommerceFindOrderBySourceInput): Promise<CommerceFindOrderBySourceResult>;
}
