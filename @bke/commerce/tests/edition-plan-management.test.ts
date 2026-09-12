import { describe, expect, it, vi } from "vitest";
import type { CommerceEditionPlanInput, CommerceEditionPlanRepository } from "../contracts/edition-plan-management.contract";
import {
  createCommerceEdition,
  normalizeCommerceEditionPlanInput,
  synchronizeCommerceEditionPlans,
  validateCommerceEditionPlanSelection,
} from "../logic/edition-plan-management";

const validInput: CommerceEditionPlanInput = {
  name: " Standard ",
  slug: "standard",
  description: " Standard edition ",
  features: [" Feature A ", "Feature B"],
  maxUsers: 10,
  maxDevicesPerUser: 3,
  updatePolicy: "ACTIVE_TERM",
  active: true,
  plans: {
    perpetual: { enabled: true, amountMinor: 85_000_00 },
    monthly: { enabled: true, amountMinor: 30_000_00 },
    annual: { enabled: true, discountBps: 500 },
  },
};

describe("edition plan management", () => {
  it("normalizes edition presentation fields while preserving commercial policy", () => {
    expect(normalizeCommerceEditionPlanInput(validInput)).toEqual({
      ...validInput,
      name: "Standard",
      description: "Standard edition",
      features: ["Feature A", "Feature B"],
    });
  });

  it("requires at least one primary purchase plan", () => {
    expect(() => validateCommerceEditionPlanSelection({
      perpetual: { enabled: false },
      monthly: { enabled: false },
      annual: { enabled: false },
    })).toThrow("INVALID_EDITION_PLAN:PURCHASE_PLAN_REQUIRED");
  });

  it("requires annual plans to be sourced from an enabled monthly plan", () => {
    expect(() => validateCommerceEditionPlanSelection({
      perpetual: { enabled: true, amountMinor: 100 },
      monthly: { enabled: false },
      annual: { enabled: true, discountBps: 500 },
    })).toThrow("INVALID_EDITION_PLAN:ANNUAL_REQUIRES_MONTHLY");
  });

  it("rejects annual discounts above the host-compatible 10 percent ceiling", () => {
    expect(() => validateCommerceEditionPlanSelection({
      perpetual: { enabled: true, amountMinor: 100 },
      monthly: { enabled: true, amountMinor: 100 },
      annual: { enabled: true, discountBps: 1_001 },
    })).toThrow("INVALID_EDITION_PLAN:ANNUAL_DISCOUNT");
  });

  it("owns exact purchase-plan upsert semantics", async () => {
    const upsertPurchasePlan = vi
      .fn<CommerceEditionPlanRepository["upsertPurchasePlan"]>()
      .mockResolvedValueOnce({ id: "perpetual" })
      .mockResolvedValueOnce({ id: "monthly" })
      .mockResolvedValueOnce({ id: "annual" });
    const repository: CommerceEditionPlanRepository = {
      createEdition: vi.fn(),
      upsertPurchasePlan,
    };

    const result = await synchronizeCommerceEditionPlans(repository, "edition-1", validInput.plans);

    expect(result.monthly.id).toBe("monthly");
    expect(upsertPurchasePlan).toHaveBeenNthCalledWith(1, {
      editionId: "edition-1",
      type: "PERPETUAL",
      amountMinor: 85_000_00,
      annualDiscountBps: null,
      monthlySourcePlanId: null,
      renewalBehavior: "NONE",
      active: true,
    });
    expect(upsertPurchasePlan).toHaveBeenNthCalledWith(2, {
      editionId: "edition-1",
      type: "MONTHLY",
      amountMinor: 30_000_00,
      annualDiscountBps: null,
      monthlySourcePlanId: null,
      renewalBehavior: "CUSTOMER_AUTHORIZED",
      active: true,
    });
    expect(upsertPurchasePlan).toHaveBeenNthCalledWith(3, {
      editionId: "edition-1",
      type: "ANNUAL",
      amountMinor: null,
      annualDiscountBps: 500,
      monthlySourcePlanId: "monthly",
      renewalBehavior: "CUSTOMER_AUTHORIZED",
      active: true,
    });
  });

  it("creates the edition before synchronizing its plans", async () => {
    const calls: string[] = [];
    const repository: CommerceEditionPlanRepository = {
      createEdition: vi.fn(async (input) => {
        calls.push(`edition:${input.name}`);
        return { id: "edition-1" };
      }),
      upsertPurchasePlan: vi.fn(async (input) => {
        calls.push(`plan:${input.type}`);
        return { id: input.type === "MONTHLY" ? "monthly" : input.type.toLowerCase() };
      }),
    };

    const result = await createCommerceEdition(repository, "product-1", validInput);

    expect(result.edition.id).toBe("edition-1");
    expect(calls).toEqual([
      "edition:Standard",
      "plan:PERPETUAL",
      "plan:MONTHLY",
      "plan:ANNUAL",
    ]);
  });
});
