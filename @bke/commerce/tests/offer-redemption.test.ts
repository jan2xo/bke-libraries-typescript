import { describe, expect, it, vi } from "vitest";
import type {
  CommerceOfferRedemptionSnapshot,
  CommerceReserveOfferRedemptionResult,
  CommerceTransitionOfferRedemptionResult,
} from "../contracts/offer-redemption.contract";
import {
  calculateCommerceOfferDiscount,
  createCommerceOfferRedemptionCapability,
  isCommerceOfferRedemptionTransitionAllowed,
  normalizeCommerceOfferCode,
} from "../logic/offer-redemption";
import type { CommerceOfferRedemptionRepository } from "../logic/offer-redemption-repository";

const now = new Date("2026-09-02T00:00:00.000Z");

const snapshot: CommerceOfferRedemptionSnapshot = {
  id: "redemption-1",
  offerId: "offer-1",
  accountId: "account-1",
  orderId: "order-1",
  status: "RESERVED",
  discountBps: 1250,
  discountedBillingCycles: null,
  baseMinor: 999,
  discountMinor: 124,
  finalMinor: 875,
  currency: "PHP",
  pricingVersion: "price-v1",
  reservedAt: now,
  appliedAt: null,
  releasedAt: null,
};

describe("Commerce offer redemption logic", () => {
  it("normalizes human-entered offer codes deterministically", () => {
    expect(normalizeCommerceOfferCode("  launch-25  ")).toBe("LAUNCH-25");
  });

  it("calculates basis-point discounts in integer minor units without over-discounting", () => {
    expect(calculateCommerceOfferDiscount({ baseMinor: 999, discountBps: 1250 })).toEqual({
      discountMinor: 124,
      finalMinor: 875,
    });
  });

  it("allows only the legacy redemption lifecycle transitions", () => {
    expect(isCommerceOfferRedemptionTransitionAllowed("RESERVED", "APPLY")).toBe(true);
    expect(isCommerceOfferRedemptionTransitionAllowed("RESERVED", "RELEASE")).toBe(true);
    expect(isCommerceOfferRedemptionTransitionAllowed("APPLIED", "REFUND")).toBe(true);
    expect(isCommerceOfferRedemptionTransitionAllowed("RELEASED", "APPLY")).toBe(false);
    expect(isCommerceOfferRedemptionTransitionAllowed("REFUNDED", "RELEASE")).toBe(false);
  });

  it("normalizes reservation inputs before persistence", async () => {
    const reserve = vi.fn<CommerceOfferRedemptionRepository["reserve"]>(async (input) => {
      expect(input.codeNormalized).toBe("LAUNCH-25");
      expect(input.accountId).toBe("account-1");
      expect(input.currency).toBe("PHP");
      expect(input.now).toEqual(now);
      return { status: "RESERVED", redemption: snapshot, idempotent: false };
    });
    const repository: CommerceOfferRedemptionRepository = {
      reserve,
      transition: vi.fn(async (): Promise<CommerceTransitionOfferRedemptionResult> => ({
        status: "NOT_FOUND",
      })),
    };
    const capability = createCommerceOfferRedemptionCapability(repository, () => now);

    const result = await capability.reserve({
      code: " launch-25 ",
      accountId: " account-1 ",
      orderId: " order-1 ",
      baseMinor: 999,
      currency: " php ",
      pricingVersion: "price-v1",
    });

    expect(result.status).toBe("RESERVED");
    expect(reserve).toHaveBeenCalledOnce();
  });

  it("fails invalid reservation input before touching persistence", async () => {
    const reserve = vi.fn<CommerceOfferRedemptionRepository["reserve"]>();
    const repository: CommerceOfferRedemptionRepository = {
      reserve,
      transition: vi.fn(),
    };
    const capability = createCommerceOfferRedemptionCapability(repository, () => now);

    const result = await capability.reserve({
      code: " ",
      accountId: "account-1",
      orderId: "order-1",
      baseMinor: 100,
      currency: "PHP",
      pricingVersion: "price-v1",
    });

    expect(result).toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(reserve).not.toHaveBeenCalled();
  });

  it("fails closed when persistence is unavailable", async () => {
    const repository: CommerceOfferRedemptionRepository = {
      reserve: vi.fn(async (): Promise<CommerceReserveOfferRedemptionResult> => {
        throw new Error("database unavailable");
      }),
      transition: vi.fn(async (): Promise<CommerceTransitionOfferRedemptionResult> => {
        throw new Error("database unavailable");
      }),
    };
    const capability = createCommerceOfferRedemptionCapability(repository, () => now);

    await expect(
      capability.reserve({
        code: "LAUNCH-25",
        accountId: "account-1",
        orderId: "order-1",
        baseMinor: 100,
        currency: "PHP",
        pricingVersion: "price-v1",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });

    await expect(
      capability.transition({ redemptionId: "redemption-1", transition: "APPLY" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
