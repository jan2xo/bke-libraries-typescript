import { describe, expect, it } from "vitest";
import { planCommerceSubscriptionRenewal } from "../logic/subscription-renewal-plan";

const base = () => ({
  currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
  intervalUnit: "MONTH" as const,
  intervalCount: 1,
  now: new Date("2026-09-16T08:00:00.000Z"),
  settlementOfferId: null,
  discountedCyclesTotal: null,
  discountedCyclesConsumed: 0,
});

describe("Commerce subscription renewal planning", () => {
  it("renews from a future current-period end and uses the monthly 7-day reminder", () => {
    expect(planCommerceSubscriptionRenewal(base())).toEqual({
      status: "PLANNED",
      currentPeriodStart: new Date("2026-10-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
      renewalReminderAt: new Date("2026-10-25T00:00:00.000Z"),
      durationMs: 31 * 86_400_000,
      discountedCycleConsumed: false,
      nextDiscountedCyclesConsumed: 0,
    });
  });

  it("reactivates an expired period from now instead of the stale period end", () => {
    const result = planCommerceSubscriptionRenewal({
      ...base(),
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      now: new Date("2026-09-16T08:00:00.000Z"),
    });
    expect(result).toMatchObject({
      status: "PLANNED",
      currentPeriodStart: new Date("2026-09-16T08:00:00.000Z"),
      currentPeriodEnd: new Date("2026-10-16T08:00:00.000Z"),
      renewalReminderAt: new Date("2026-10-09T08:00:00.000Z"),
    });
  });

  it("preserves V1 UTC month rollover semantics", () => {
    const result = planCommerceSubscriptionRenewal({
      ...base(),
      currentPeriodEnd: new Date("2027-01-31T00:00:00.000Z"),
      now: new Date("2027-01-01T00:00:00.000Z"),
    });
    expect(result).toMatchObject({
      status: "PLANNED",
      currentPeriodStart: new Date("2027-01-31T00:00:00.000Z"),
      currentPeriodEnd: new Date("2027-03-03T00:00:00.000Z"),
      renewalReminderAt: new Date("2027-02-24T00:00:00.000Z"),
    });
  });

  it("preserves V1 UTC yearly semantics and 30-day reminder", () => {
    const result = planCommerceSubscriptionRenewal({
      ...base(),
      intervalUnit: "YEAR",
      intervalCount: 1,
      currentPeriodEnd: new Date("2028-02-29T00:00:00.000Z"),
      now: new Date("2028-02-01T00:00:00.000Z"),
    });
    expect(result).toMatchObject({
      status: "PLANNED",
      currentPeriodStart: new Date("2028-02-29T00:00:00.000Z"),
      currentPeriodEnd: new Date("2029-03-01T00:00:00.000Z"),
      renewalReminderAt: new Date("2029-01-30T00:00:00.000Z"),
    });
  });

  it("consumes exactly one discounted cycle when a settling offer exists and capacity remains", () => {
    const result = planCommerceSubscriptionRenewal({
      ...base(),
      settlementOfferId: "offer-1",
      discountedCyclesTotal: 3,
      discountedCyclesConsumed: 1,
    });
    expect(result).toMatchObject({
      status: "PLANNED",
      discountedCycleConsumed: true,
      nextDiscountedCyclesConsumed: 2,
    });
  });

  it("does not consume a discounted cycle without a settling offer or after capacity is exhausted", () => {
    expect(planCommerceSubscriptionRenewal({
      ...base(),
      settlementOfferId: null,
      discountedCyclesTotal: 3,
      discountedCyclesConsumed: 1,
    })).toMatchObject({
      status: "PLANNED",
      discountedCycleConsumed: false,
      nextDiscountedCyclesConsumed: 1,
    });

    expect(planCommerceSubscriptionRenewal({
      ...base(),
      settlementOfferId: "offer-1",
      discountedCyclesTotal: 2,
      discountedCyclesConsumed: 2,
    })).toMatchObject({
      status: "PLANNED",
      discountedCycleConsumed: false,
      nextDiscountedCyclesConsumed: 2,
    });
  });

  it("does not mutate caller-owned dates", () => {
    const input = base();
    const originalEnd = input.currentPeriodEnd.getTime();
    const originalNow = input.now.getTime();
    planCommerceSubscriptionRenewal(input);
    expect(input.currentPeriodEnd.getTime()).toBe(originalEnd);
    expect(input.now.getTime()).toBe(originalNow);
  });

  it.each([
    { intervalCount: 0 },
    { intervalCount: 121 },
    { settlementOfferId: "" },
    { discountedCyclesTotal: 0 },
    { discountedCyclesConsumed: -1 },
    { discountedCyclesConsumed: 1.5 },
    { now: new Date("invalid") },
  ])("fails closed for invalid input %#", (overrides) => {
    expect(planCommerceSubscriptionRenewal({ ...base(), ...overrides } as ReturnType<typeof base>))
      .toEqual({ status: "FAILED", code: "INVALID_INPUT" });
  });
});
