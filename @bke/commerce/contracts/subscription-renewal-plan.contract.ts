export const COMMERCE_SUBSCRIPTION_RENEWAL_PLAN_CAPABILITY_ID =
  "bke.commerce.subscription-renewal-plan.v1" as const;

export type CommerceSubscriptionRenewalIntervalUnit = "MONTH" | "YEAR";

export interface CommerceSubscriptionRenewalPlanInput {
  readonly currentPeriodEnd: Date;
  readonly intervalUnit: CommerceSubscriptionRenewalIntervalUnit;
  readonly intervalCount: number;
  readonly now: Date;
  readonly settlementOfferId: string | null;
  readonly discountedCyclesTotal: number | null;
  readonly discountedCyclesConsumed: number;
}

export type CommerceSubscriptionRenewalPlanResult =
  | Readonly<{
      status: "PLANNED";
      currentPeriodStart: Date;
      currentPeriodEnd: Date;
      renewalReminderAt: Date;
      durationMs: number;
      discountedCycleConsumed: boolean;
      nextDiscountedCyclesConsumed: number;
    }>
  | Readonly<{
      status: "FAILED";
      code: "INVALID_INPUT";
    }>;

export interface CommerceSubscriptionRenewalPlanCapability {
  plan(input: CommerceSubscriptionRenewalPlanInput): CommerceSubscriptionRenewalPlanResult;
}
