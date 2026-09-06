export const COMMERCE_SUBSCRIPTION_STATUS_LOOKUP_CAPABILITY_ID = "bke.commerce.subscription-status-lookup.v1" as const;

export type CommerceSubscriptionStatus = "PENDING" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELLED";
export type CommerceSubscriptionStatusSnapshot = Readonly<{ id: string; status: CommerceSubscriptionStatus; currentPeriodStart: Date; currentPeriodEnd: Date }>;
export type CommerceSubscriptionStatusLookupResult =
  | { readonly status: "FOUND"; readonly subscription: CommerceSubscriptionStatusSnapshot }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };
export interface CommerceSubscriptionStatusLookupCapability { find(input: { readonly subscriptionId: string }): Promise<CommerceSubscriptionStatusLookupResult>; }
