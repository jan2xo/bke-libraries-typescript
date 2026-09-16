import { describe, expect, it, vi } from "vitest";
import type { CommerceSubscriptionLifecycleSnapshot } from "../contracts/subscription-lifecycle-management.contract";
import { createCommerceSubscriptionLifecycleManagementCapability } from "../logic/subscription-lifecycle-management";

const now = new Date("2026-01-15T12:00:00.000Z");
const snapshot: CommerceSubscriptionLifecycleSnapshot = {
  id: "subscription-1",
  accountId: "account-1",
  orderId: "order-1",
  productId: "product-1",
  editionId: "edition-1",
  purchasePlanId: "plan-1",
  status: "ACTIVE",
  seats: 3,
  currentPeriodStart: now,
  currentPeriodEnd: new Date("2026-02-15T12:00:00.000Z"),
  renewalReminderAt: new Date("2026-02-08T12:00:00.000Z"),
  currency: "PHP",
  normalRecurringAmountMinor: 30_000,
  discountedRecurringAmountMinor: 25_000,
  promotionalDiscountBps: 500,
  discountedCyclesTotal: 3,
  discountedCyclesConsumed: 1,
  offerId: "offer-1",
  pricingVersion: "pricing-v1",
};

const startInput = {
  accountId: " account-1 ", orderId: " order-1 ", productId: " product-1 ",
  editionId: " edition-1 ", purchasePlanId: " plan-1 ", seats: 3,
  intervalUnit: "MONTH" as const, intervalCount: 1, now,
  currency: " PHP ", normalRecurringAmountMinor: 30_000,
  discountedRecurringAmountMinor: 25_000, promotionalDiscountBps: 500,
  discountedCyclesTotal: 3, offerId: " offer-1 ",
  offerSnapshot: { discountBps: 500 }, pricingVersion: " pricing-v1 ",
};

describe("Commerce subscription lifecycle management", () => {
  it("uses the renewal-plan capability for initial period semantics", async () => {
    const start = vi.fn().mockResolvedValue(snapshot);
    const capability = createCommerceSubscriptionLifecycleManagementCapability({ start, renew: vi.fn() });
    await expect(capability.start(startInput)).resolves.toEqual({ status: "OK", subscription: snapshot, discountedCycleConsumed: true });
    expect(start).toHaveBeenCalledWith({
      accountId: "account-1", orderId: "order-1", productId: "product-1",
      editionId: "edition-1", purchasePlanId: "plan-1", seats: 3,
      currentPeriodStart: now,
      currentPeriodEnd: new Date("2026-02-15T12:00:00.000Z"),
      renewalReminderAt: new Date("2026-02-08T12:00:00.000Z"),
      currency: "PHP", normalRecurringAmountMinor: 30_000,
      discountedRecurringAmountMinor: 25_000, promotionalDiscountBps: 500,
      discountedCyclesTotal: 3, discountedCyclesConsumed: 1,
      offerId: "offer-1", offerSnapshot: { discountBps: 500 }, pricingVersion: "pricing-v1",
    });
  });

  it("rejects invalid lifecycle input before persistence", async () => {
    const start = vi.fn();
    const renew = vi.fn();
    const capability = createCommerceSubscriptionLifecycleManagementCapability({ start, renew });
    await expect(capability.start({ ...startInput, seats: 0 })).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    await expect(capability.start({ ...startInput, intervalCount: 0 })).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    await expect(capability.start({ ...startInput, now: new Date("invalid") })).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    await expect(capability.start({ ...startInput, promotionalDiscountBps: 10_001 })).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    await expect(capability.renew({ subscriptionId: "subscription-1", intervalUnit: "MONTH", intervalCount: 0, now })).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(start).not.toHaveBeenCalled();
    expect(renew).not.toHaveBeenCalled();
  });

  it("normalizes renewal input and delegates one atomic repository operation", async () => {
    const renewed = { ...snapshot, currentPeriodStart: snapshot.currentPeriodEnd, currentPeriodEnd: new Date("2026-03-15T12:00:00.000Z"), discountedCyclesConsumed: 2 };
    const renew = vi.fn().mockResolvedValue({ subscription: renewed, discountedCycleConsumed: true });
    const capability = createCommerceSubscriptionLifecycleManagementCapability({ start: vi.fn(), renew });
    await expect(capability.renew({ subscriptionId: " subscription-1 ", intervalUnit: "MONTH", intervalCount: 1, now, settlementOfferId: " offer-1 " })).resolves.toEqual({ status: "OK", subscription: renewed, discountedCycleConsumed: true });
    expect(renew).toHaveBeenCalledWith({ subscriptionId: "subscription-1", intervalUnit: "MONTH", intervalCount: 1, now, settlementOfferId: "offer-1" });
  });

  it("reports missing subscriptions and fails closed on persistence errors", async () => {
    const missing = createCommerceSubscriptionLifecycleManagementCapability({ start: vi.fn(), renew: vi.fn().mockResolvedValue(null) });
    await expect(missing.renew({ subscriptionId: "missing", intervalUnit: "YEAR", intervalCount: 1, now })).resolves.toEqual({ status: "FAILED", code: "SUBSCRIPTION_NOT_FOUND" });
    const broken = createCommerceSubscriptionLifecycleManagementCapability({ start: vi.fn().mockRejectedValue(new Error("db")), renew: vi.fn().mockRejectedValue(new Error("db")) });
    await expect(broken.start(startInput)).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
    await expect(broken.renew({ subscriptionId: "subscription-1", intervalUnit: "MONTH", intervalCount: 1, now })).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
