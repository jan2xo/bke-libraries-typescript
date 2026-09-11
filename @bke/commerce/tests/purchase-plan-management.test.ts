import { describe, expect, it, vi } from "vitest";
import {
  createCommercePurchasePlanManagementCapability,
  validatePurchasePlanManagementInput,
} from "../logic/purchase-plan-management";

const validInput = {
  editionId: "edition-1",
  perpetual: { enabled: true, amountMinor: 300_000 },
  monthly: { enabled: true, amountMinor: 25_000 },
  annual: { enabled: true, discountBps: 500 },
} as const;

describe("Commerce purchase-plan management", () => {
  it("accepts the V1-compatible perpetual/monthly/annual configuration", () => {
    expect(validatePurchasePlanManagementInput(validInput)).toBeNull();
  });

  it("requires at least one non-annual purchase plan", () => {
    expect(validatePurchasePlanManagementInput({
      ...validInput,
      perpetual: { enabled: false },
      monthly: { enabled: false },
      annual: { enabled: false },
    })).toEqual({ status: "FAILED", code: "NO_ENABLED_PLAN" });
  });

  it("requires an amount for enabled perpetual and monthly plans", () => {
    expect(validatePurchasePlanManagementInput({
      ...validInput,
      perpetual: { enabled: true },
    })).toEqual({ status: "FAILED", code: "PERPETUAL_AMOUNT_REQUIRED" });
    expect(validatePurchasePlanManagementInput({
      ...validInput,
      monthly: { enabled: true },
    })).toEqual({ status: "FAILED", code: "MONTHLY_AMOUNT_REQUIRED" });
  });

  it("requires monthly when annual is enabled", () => {
    expect(validatePurchasePlanManagementInput({
      ...validInput,
      monthly: { enabled: false },
      annual: { enabled: true, discountBps: 500 },
    })).toEqual({ status: "FAILED", code: "ANNUAL_REQUIRES_MONTHLY" });
  });

  it("requires an annual discount and preserves the 0..1000 bps range", () => {
    expect(validatePurchasePlanManagementInput({
      ...validInput,
      annual: { enabled: true },
    })).toEqual({ status: "FAILED", code: "ANNUAL_DISCOUNT_REQUIRED" });
    expect(validatePurchasePlanManagementInput({
      ...validInput,
      annual: { enabled: true, discountBps: 1_001 },
    })).toEqual({ status: "FAILED", code: "ANNUAL_DISCOUNT_REQUIRED" });
  });

  it("passes normalized persistence semantics to the repository", async () => {
    const sync = vi.fn().mockResolvedValue([]);
    const capability = createCommercePurchasePlanManagementCapability({ sync });
    await expect(capability.sync(validInput)).resolves.toEqual({ status: "OK", plans: [] });
    expect(sync).toHaveBeenCalledWith({
      editionId: "edition-1",
      perpetual: { active: true, amountMinor: 300_000 },
      monthly: { active: true, amountMinor: 25_000 },
      annual: { active: true, discountBps: 500, monthlySourceRequired: true },
    });
  });

  it("fails closed when persistence is unavailable", async () => {
    const capability = createCommercePurchasePlanManagementCapability({
      sync: vi.fn().mockRejectedValue(new Error("db unavailable")),
    });
    await expect(capability.sync(validInput)).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});
