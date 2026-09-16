import type {
  CommerceRenewSubscriptionInput,
  CommerceStartSubscriptionInput,
  CommerceSubscriptionIntervalUnit,
  CommerceSubscriptionLifecycleManagementCapability,
  CommerceSubscriptionLifecycleResult,
  CommerceSubscriptionLifecycleSnapshot,
  CommerceSubscriptionRenewalPlan,
  CommerceSubscriptionRenewalPlanInput,
} from "../contracts/subscription-lifecycle-management.contract";

export interface CommerceSubscriptionLifecycleRepository {
  start(input: {
    readonly accountId: string;
    readonly orderId: string;
    readonly productId: string;
    readonly editionId: string | null;
    readonly purchasePlanId: string | null;
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
    readonly offerSnapshot: unknown;
    readonly pricingVersion: string | null;
  }): Promise<CommerceSubscriptionLifecycleSnapshot>;
  renew(input: {
    readonly subscriptionId: string;
    readonly intervalUnit: CommerceSubscriptionIntervalUnit;
    readonly intervalCount: number;
    readonly now: Date;
    readonly settlementOfferId: string | null;
  }): Promise<{
    readonly subscription: CommerceSubscriptionLifecycleSnapshot;
    readonly discountedCycleConsumed: boolean;
  } | null>;
}

const DAY_MS = 86_400_000;

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validId(value: string): boolean {
  return Boolean(value.trim());
}

function validOptionalId(value: string | null | undefined): boolean {
  return value == null || Boolean(value.trim());
}

function validOptionalMinor(value: number | null | undefined): boolean {
  return value == null || (Number.isSafeInteger(value) && value >= 0);
}

function validOptionalBps(value: number | null | undefined): boolean {
  return value == null || (Number.isSafeInteger(value) && value >= 0 && value <= 10_000);
}

function validOptionalCycles(value: number | null | undefined): boolean {
  return value == null || (Number.isSafeInteger(value) && value >= 1 && value <= 10_000);
}

function validPeriod(intervalUnit: CommerceSubscriptionIntervalUnit, intervalCount: number): boolean {
  return (intervalUnit === "MONTH" || intervalUnit === "YEAR")
    && Number.isSafeInteger(intervalCount)
    && intervalCount >= 1
    && intervalCount <= 120;
}

export function commerceSubscriptionPeriod(
  start: Date,
  intervalUnit: CommerceSubscriptionIntervalUnit,
  intervalCount: number,
): { currentPeriodEnd: Date; renewalReminderAt: Date } {
  const currentPeriodEnd = new Date(start);
  if (intervalUnit === "YEAR") currentPeriodEnd.setUTCFullYear(currentPeriodEnd.getUTCFullYear() + intervalCount);
  else currentPeriodEnd.setUTCMonth(currentPeriodEnd.getUTCMonth() + intervalCount);
  const reminderDays = intervalUnit === "MONTH" ? 7 : 30;
  return {
    currentPeriodEnd,
    renewalReminderAt: new Date(currentPeriodEnd.getTime() - reminderDays * DAY_MS),
  };
}

/**
 * Pure Commerce-owned renewal decision. This function intentionally performs no
 * persistence so a host can execute the resulting plan inside an existing
 * cross-domain transaction without duplicating Commerce policy.
 */
export function planCommerceSubscriptionRenewal(
  input: CommerceSubscriptionRenewalPlanInput,
): CommerceSubscriptionRenewalPlan | null {
  if (!validDate(input.currentPeriodEnd)
    || !validDate(input.now)
    || !validPeriod(input.intervalUnit, input.intervalCount)
    || !validOptionalId(input.settlementOfferId)
    || !validOptionalCycles(input.discountedCyclesTotal)
    || !Number.isSafeInteger(input.discountedCyclesConsumed)
    || input.discountedCyclesConsumed < 0) {
    return null;
  }

  const currentPeriodStart = input.currentPeriodEnd.getTime() > input.now.getTime()
    ? new Date(input.currentPeriodEnd)
    : new Date(input.now);
  const period = commerceSubscriptionPeriod(currentPeriodStart, input.intervalUnit, input.intervalCount);
  const discountedCycleConsumed = Boolean(
    input.settlementOfferId
    && input.discountedCyclesTotal
    && input.discountedCyclesConsumed < input.discountedCyclesTotal,
  );

  return Object.freeze({
    currentPeriodStart,
    currentPeriodEnd: period.currentPeriodEnd,
    renewalReminderAt: period.renewalReminderAt,
    discountedCycleConsumed,
    nextDiscountedCyclesConsumed:
      input.discountedCyclesConsumed + (discountedCycleConsumed ? 1 : 0),
  });
}

function validateStart(input: CommerceStartSubscriptionInput): boolean {
  return validId(input.accountId)
    && validId(input.orderId)
    && validId(input.productId)
    && validOptionalId(input.editionId)
    && validOptionalId(input.purchasePlanId)
    && Number.isSafeInteger(input.seats)
    && input.seats >= 1
    && validPeriod(input.intervalUnit, input.intervalCount)
    && validDate(input.now)
    && (input.currency == null || Boolean(input.currency.trim()))
    && validOptionalMinor(input.normalRecurringAmountMinor)
    && validOptionalMinor(input.discountedRecurringAmountMinor)
    && validOptionalBps(input.promotionalDiscountBps)
    && validOptionalCycles(input.discountedCyclesTotal)
    && validOptionalId(input.offerId)
    && (input.pricingVersion == null || Boolean(input.pricingVersion.trim()));
}

function validateRenew(input: CommerceRenewSubscriptionInput): boolean {
  return validId(input.subscriptionId)
    && validPeriod(input.intervalUnit, input.intervalCount)
    && validDate(input.now)
    && validOptionalId(input.settlementOfferId);
}

export function createCommerceSubscriptionLifecycleManagementCapability(
  repository: CommerceSubscriptionLifecycleRepository,
): CommerceSubscriptionLifecycleManagementCapability {
  return Object.freeze({
    async start(input: CommerceStartSubscriptionInput): Promise<CommerceSubscriptionLifecycleResult> {
      if (!validateStart(input)) return { status: "FAILED", code: "INVALID_INPUT" };
      const period = commerceSubscriptionPeriod(input.now, input.intervalUnit, input.intervalCount);
      try {
        const subscription = await repository.start({
          accountId: input.accountId.trim(),
          orderId: input.orderId.trim(),
          productId: input.productId.trim(),
          editionId: input.editionId?.trim() || null,
          purchasePlanId: input.purchasePlanId?.trim() || null,
          seats: input.seats,
          currentPeriodStart: input.now,
          currentPeriodEnd: period.currentPeriodEnd,
          renewalReminderAt: period.renewalReminderAt,
          currency: input.currency?.trim() || null,
          normalRecurringAmountMinor: input.normalRecurringAmountMinor ?? null,
          discountedRecurringAmountMinor: input.discountedRecurringAmountMinor ?? null,
          promotionalDiscountBps: input.promotionalDiscountBps ?? null,
          discountedCyclesTotal: input.discountedCyclesTotal ?? null,
          discountedCyclesConsumed: input.discountedCyclesTotal ? 1 : 0,
          offerId: input.offerId?.trim() || null,
          offerSnapshot: input.offerSnapshot ?? null,
          pricingVersion: input.pricingVersion?.trim() || null,
        });
        return {
          status: "OK",
          subscription,
          discountedCycleConsumed: subscription.discountedCyclesConsumed > 0,
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },

    async renew(input: CommerceRenewSubscriptionInput): Promise<CommerceSubscriptionLifecycleResult> {
      if (!validateRenew(input)) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const renewed = await repository.renew({
          subscriptionId: input.subscriptionId.trim(),
          intervalUnit: input.intervalUnit,
          intervalCount: input.intervalCount,
          now: input.now,
          settlementOfferId: input.settlementOfferId?.trim() || null,
        });
        if (!renewed) return { status: "FAILED", code: "SUBSCRIPTION_NOT_FOUND" };
        return { status: "OK", ...renewed };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
