import { describe, expect, it, vi } from "vitest";
import { createCommercePublicPromotionPreviewCapability } from "../logic/public-promotion-preview";
import type { CommercePublicPromotionPreviewRepository } from "../logic/public-promotion-preview-repository";

const now = new Date("2026-09-11T00:00:00.000Z");

function input() {
  return {
    productId: "product-1",
    editionId: "edition-1",
    purchasePlanId: "plan-1",
    planType: "MONTHLY" as const,
    baseMinor: 999,
  };
}

describe("Commerce public promotion preview", () => {
  it("prices the best eligible promotion with the canonical offer rounding rule", async () => {
    const findBest = vi.fn<CommercePublicPromotionPreviewRepository["findBest"]>(async (request) => {
      expect(request).toMatchObject(input());
      expect(request.now).toEqual(now);
      return {
        offerId: "offer-1",
        name: "Launch",
        discountBps: 1250,
        discountedBillingCycles: null,
      };
    });
    const capability = createCommercePublicPromotionPreviewCapability({ findBest }, () => now);
    await expect(capability.preview(input())).resolves.toEqual({
      status: "PRICED",
      value: {
        offerId: "offer-1",
        name: "Launch",
        discountBps: 1250,
        discountedBillingCycles: null,
        discountMinor: 125,
        finalMinor: 874,
      },
    });
  });

  it("returns NONE when no public promotion is eligible", async () => {
    const capability = createCommercePublicPromotionPreviewCapability({
      findBest: vi.fn(async () => null),
    });
    await expect(capability.preview(input())).resolves.toEqual({ status: "NONE" });
  });

  it("fails invalid input before persistence", async () => {
    const findBest = vi.fn<CommercePublicPromotionPreviewRepository["findBest"]>();
    const capability = createCommercePublicPromotionPreviewCapability({ findBest });
    await expect(capability.preview({ ...input(), purchasePlanId: " " })).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(findBest).not.toHaveBeenCalled();
  });

  it("fails closed when persistence is unavailable", async () => {
    const capability = createCommercePublicPromotionPreviewCapability({
      findBest: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    await expect(capability.preview(input())).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});
