import type { CommerceSubscriptionStatusSnapshot } from "../contracts/subscription-status-lookup.contract";
export interface CommerceSubscriptionStatusLookupRepository { findById(subscriptionId: string): Promise<CommerceSubscriptionStatusSnapshot | null>; }
