import type {
  CommerceSubscriptionRenewalPlanCapability,
  CommerceSubscriptionRenewalPlanInput,
  CommerceSubscriptionRenewalPlanResult,
} from "../contracts/subscription-renewal-plan.contract";

const DAY_MS = 86_400_000;

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validInput(input: CommerceSubscriptionRenewalPlanInput): boolean {
  return validDate(input.currentPeriodEnd)
    && validDate(input.now)
    && (input.intervalUnit === "MONTH" || input.intervalUnit === "YEAR")
    && Number.isSafeInteger(input.intervalCount)
    && input.intervalCount >= 1
    && input.intervalCount <= 120
    && (input.settlementOfferId === null || Boolean(input.settlementOfferId.trim()))
    && (input.discountedCyclesTotal === null
      || (Number.isSafeInteger(input.discountedCyclesTotal)
        && input.discountedCyclesTotal >= 1
        && input.discountedCyclesTotal <= 10_000))
    && Number.isSafeInteger(input.discountedCyclesConsumed)
    && input.discountedCyclesConsumed >= 0;
}

function addInterval(
  start: Date,
  intervalUnit: "MONTH" | "YEAR",
  intervalCount: number,
): Date {
  const end = new Date(start);
  if (intervalUnit === "YEAR") end.setUTCFullYear(end.getUTCFullYear() + intervalCount);
  else end.setUTCMonth(end.getUTCMonth() + intervalCount);
  return end;
}

export function planCommerceSubscriptionRenewal(
  input: CommerceSubscriptionRenewalPlanInput,
): CommerceSubscriptionRenewalPlanResult {
  if (!validInput(input)) return { status: "FAILED", code: "INVALID_INPUT" };

  const currentPeriodStart = input.currentPeriodEnd.getTime() > input.now.getTime()
    ? new Date(input.currentPeriodEnd)
    : new Date(input.now);
  const currentPeriodEnd = addInterval(currentPeriodStart, input.intervalUnit, input.intervalCount);
  const reminderDays = input.intervalUnit === "MONTH" ? 7 : 30;
  const renewalReminderAt = new Date(currentPeriodEnd.getTime() - reminderDays * DAY_MS);
  const discountedCycleConsumed = Boolean(
    input.settlementOfferId
    && input.discountedCyclesTotal
    && input.discountedCyclesConsumed < input.discountedCyclesTotal,
  );
  const nextDiscountedCyclesConsumed =
    input.discountedCyclesConsumed + (discountedCycleConsumed ? 1 : 0);

  return {
    status: "PLANNED",
    currentPeriodStart,
    currentPeriodEnd,
    renewalReminderAt,
    durationMs: currentPeriodEnd.getTime() - currentPeriodStart.getTime(),
    discountedCycleConsumed,
    nextDiscountedCyclesConsumed,
  };
}

export function createCommerceSubscriptionRenewalPlanCapability(): CommerceSubscriptionRenewalPlanCapability {
  return Object.freeze({ plan: planCommerceSubscriptionRenewal });
}
