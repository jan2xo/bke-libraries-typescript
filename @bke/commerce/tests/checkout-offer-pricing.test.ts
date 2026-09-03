import { describe, expect, it, vi } from "vitest";
import { createCommerceCheckoutOfferPricingCapability } from "../logic/checkout-offer-pricing";
import type { CommerceCheckoutOfferPricingRepository } from "../logic/checkout-offer-pricing-repository";

const now = new Date("2026-09-03T12:00:00.000Z");

function repository(): CommerceCheckoutOfferPricingRepository {
  return {
    price: vi.fn(async () => ({
      status: "PRICED" as const,
      value: {
        orderId: "order-1",
        subtotalMinor: 750,
        totalMinor: 750,
        offer: null,
      },
    })),
  };
}

describe("Commerce checkout offer pricing capability", () => {
  it("normalizes order and optional offer identifiers before persistence", async () => {
    const repo = repository();
    const capability = createCommerceCheckoutOfferPricingCapability(repo, () => now);

    await capability.price({ orderId: " order-1 ", offerIdentifier: " launch-25 " });

    expect(repo.price).toHaveBeenCalledWith({
      orderId: "order-1",
      offerIdentifier: "launch-25",
      now,
    });
  });

  it("passes null when automatic public promotion discovery is requested", async () => {
    const repo = repository();
    const capability = createCommerceCheckoutOfferPricingCapability(repo, () => now);

    await capability.price({ orderId: "order-1" });

    expect(repo.price).toHaveBeenCalledWith({ orderId: "order-1", offerIdentifier: null, now });
  });

  it("fails invalid input before touching persistence", async () => {
    const repo = repository();
    const capability = createCommerceCheckoutOfferPricingCapability(repo, () => now);

    await expect(capability.price({ orderId: " " })).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    await expect(
      capability.price({ orderId: "order-1", offerIdentifier: " " }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(repo.price).not.toHaveBeenCalled();
  });

  it("fails closed when the repository is unavailable", async () => {
    const repo: CommerceCheckoutOfferPricingRepository = {
      price: vi.fn(async () => {
        throw new Error("postgres unavailable");
      }),
    };
    const capability = createCommerceCheckoutOfferPricingCapability(repo, () => now);

    await expect(capability.price({ orderId: "order-1" })).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});
