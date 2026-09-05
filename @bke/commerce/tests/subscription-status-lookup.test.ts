import { describe, expect, it } from "vitest";
import { createCommerceSubscriptionStatusLookupCapability } from "../logic/subscription-status-lookup";

describe("Commerce subscription status lookup", () => {
  const statuses = ["PENDING", "ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"] as const;
  it.each(statuses)("passes through %s and dates", async (status) => {
    const subscription = { id: "opaque-id", status, currentPeriodStart: new Date("2030-01-01"), currentPeriodEnd: new Date("2020-01-01") };
    const repository = { findById: async (id: string) => { expect(id).toBe(" opaque-id "); return subscription; } };
    await expect(createCommerceSubscriptionStatusLookupCapability(repository).find({ subscriptionId: " opaque-id " })).resolves.toEqual({ status: "FOUND", subscription });
  });
  it("returns not found and rejects invalid input without lookup", async () => {
    let calls = 0;
    const capability = createCommerceSubscriptionStatusLookupCapability({ findById: async () => { calls += 1; return null; } });
    await expect(capability.find({ subscriptionId: "missing" })).resolves.toEqual({ status: "NOT_FOUND" });
    await expect(capability.find({ subscriptionId: "   " })).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    await expect(capability.find({ subscriptionId: "x".repeat(257) })).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(calls).toBe(1);
  });
  it("maps repository failure", async () => {
    await expect(createCommerceSubscriptionStatusLookupCapability({ findById: async () => { throw new Error("unavailable"); } }).find({ subscriptionId: "s" })).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
