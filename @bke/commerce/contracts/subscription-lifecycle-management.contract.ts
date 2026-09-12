export const COMMERCE_SUBSCRIPTION_LIFECYCLE_MANAGEMENT_CAPABILITY_ID =
  "bke.commerce.subscription-lifecycle-management.v1" as const;

export type CommerceSubscriptionIntervalUnit = "MONTH" | "YEAR";

export interface CommerceSubscriptionLifecycleSnapshot {
  readonly id: string;
  readonly accountId: string;
  readonly orderId: string;
  readonly productId: string;
  readonly editionId: string | null;
  readonly purchasePlanId: string | null;
  readonly status: "ACTIVE";
  readonly seats: number;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly renewalReminderAt: Date;
  readonly currency: string | null;
  readonly normalRecurringAmountMinor: number | null;
  readonly discountedRecurringAmountMinor: number | null;
  readonly promotionalDiscountBps: number | null;
  readonly discountedCyclesTotal: number | null;
  readonly discountedCyclesConsumed: number;
  readonly offerId: string | null;
  readonly pricingVersion: string | null;
}

export interface CommerceStartSubscriptionInput {
  readonly accountId: string;
  readonly orderId: string;
  readonly productId: string;
  readonly editionId?: string | null;
  readonly purchasePlanId?: string | null;
  readonly seats: number;
  readonly intervalUnit: CommerceSubscriptionIntervalUnit;
  readonly intervalCount: number;
  readonly now: Date;
  readonly currency?: string | null;
  readonly normalRecurringAmountMinor?: number | null;
  readonly discountedRecurringAmountMinor?: number | null;
  readonly promotionalDiscountBps?: number | null;
  readonly discountedCyclesTotal?: number | null;
  readonly offerId?: string | null;
  readonly offerSnapshot?: unknown;
  readonly pricingVersion?: string | null;
}

export interface CommerceRenewSubscriptionInput {
  readonly subscriptionId: string;
  readonly intervalUnit: CommerceSubscriptionIntervalUnit;
  readonly intervalCount: number;
  readonly now: Date;
  readonly settlementOfferId?: string | null;
}

export type CommerceSubscriptionLifecycleFailureCode =
  | "INVALID_INPUT"
  | "SUBSCRIPTION_NOT_FOUND"
  | "SUBSCRIPTION_CANCELLED"
  | "PERSISTENCE_UNAVAILABLE";

export type CommerceSubscriptionLifecycleResult =
  | {
      readonly status: "OK";
      readonly subscription: CommerceSubscriptionLifecycleSnapshot;
      readonly discountedCycleConsumed: boolean;
    }
  | {
      readonly status: "FAILED";
      readonly code: CommerceSubscriptionLifecycleFailureCode;
    };

export interface CommerceSubscriptionLifecycleManagementCapability {
  start(input: CommerceStartSubscriptionInput): Promise<CommerceSubscriptionLifecycleResult>;
  renew(input: CommerceRenewSubscriptionInput): Promise<CommerceSubscriptionLifecycleResult>;
}
