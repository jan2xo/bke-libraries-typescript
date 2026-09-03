import { describe, expect, it } from "vitest";
import type { CommercePurchasePlanLookupRepository } from "../logic/purchase-plan-lookup-repository";
import { createCommercePurchasePlanLookupCapability } from "../logic/purchase-plan-lookup";

const sample = {
  id: "annual-plan",
  editionId: "edition-1",
  type: "ANNUAL" as const,
  currency: "PHP",
  amountMinor: null,
  annualDiscountBps: 1_000,
  renewalBehavior: "CUSTOMER_AUTHORIZED" as const,
  active: true,
  monthlySource: {
    amountMinor: 1_000,
    active: true,
    type: "MONTHLY" as const,
    editionId: "edition-1",
  },
  legacyPriceId: "legacy-price",
  legacyPrice: {
    id: "legacy-price",
    productId: "product-1",
    licensePolicyId: "policy-1",
    name: "Legacy annual",
    amountMinor: 10_800,
    currency: "PHP",
    billingType: "SUBSCRIPTION" as const,
    intervalUnit: "YEAR" as const,
    intervalCount: 1,
    active: true,
  },
};

describe("Commerce purchase-plan lookup", () => {
  it("returns the repository snapshot without reaching other module persistence", async () => {
    const repository: CommercePurchasePlanLookupRepository = {
      findById: async () => sample,
    };
    const result = await createCommercePurchasePlanLookupCapability(repository).find({
      planId: " annual-plan ",
    });
    expect(result).toEqual({ status: "FOUND", plan: sample });
  });

  it("distinguishes missing plans from invalid input", async () => {
    const repository: CommercePurchasePlanLookupRepository = {
      findById: async () => null,
    };
    const capability = createCommercePurchasePlanLookupCapability(repository);
    await expect(capability.find({ planId: "missing" })).resolves.toEqual({ status: "NOT_FOUND" });
    await expect(capability.find({ planId: "   " })).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
  });

  it("maps repository failure to a typed persistence failure", async () => {
    const repository: CommercePurchasePlanLookupRepository = {
      findById: async () => {
        throw new Error("database unavailable");
      },
    };
    await expect(
      createCommercePurchasePlanLookupCapability(repository).find({ planId: "plan-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
