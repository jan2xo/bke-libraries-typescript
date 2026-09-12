import { describe, expect, it, vi } from "vitest";
import {
  createLicensingEntitlementManagementCapability,
  licensingInitialExpiration,
  licensingRenewalExpiration,
} from "../logic/entitlement-management";

const issuedLicense = {
  id: "license-1",
  publicId: "public-1",
  subscriptionId: null,
  status: "ACTIVE" as const,
  expiresAt: null,
};

describe("Licensing entitlement management", () => {
  it("preserves initial one-time entitlement expiration from validity days", () => {
    const effectiveAt = new Date("2026-09-12T00:00:00.000Z");
    expect(licensingInitialExpiration(effectiveAt, undefined)).toBeNull();
    expect(licensingInitialExpiration(effectiveAt, null)).toBeNull();
    expect(licensingInitialExpiration(effectiveAt, 0)).toBeNull();
    expect(licensingInitialExpiration(effectiveAt, 30)?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("preserves the host renewal expiration rule", () => {
    const effectiveAt = new Date("2026-09-12T00:00:00.000Z");
    const futureExpiry = new Date("2026-10-01T00:00:00.000Z");
    expect(licensingRenewalExpiration(null, effectiveAt, 1_000).toISOString()).toBe("2026-09-12T00:00:01.000Z");
    expect(licensingRenewalExpiration(futureExpiry, effectiveAt, 1_000).toISOString()).toBe("2026-10-01T00:00:01.000Z");
  });

  it("normalizes settled entitlement issuance into the repository port", async () => {
    const issue = vi.fn().mockResolvedValue(issuedLicense);
    const capability = createLicensingEntitlementManagementCapability({
      issue,
      renewSubscription: vi.fn(),
    });
    const result = await capability.issue({
      keyMaterial: {
        publicId: " public-1 ",
        keyHash: " hash-1 ",
        keyLastFour: "1234",
        keyCiphertext: " encrypted ",
      },
      accountId: " account-1 ",
      orderId: " order-1 ",
      orderItemId: " item-1 ",
      productId: " product-1 ",
      editionId: " edition-1 ",
      purchasePlanId: " plan-1 ",
      maxSeats: 3,
      maxDevicesPerSeat: 2,
      eventMetadata: { planType: "PERPETUAL" },
    });

    expect(result).toEqual({ status: "OK", licenses: [issuedLicense], renewalOperations: [] });
    expect(issue).toHaveBeenCalledWith({
      publicId: "public-1",
      keyHash: "hash-1",
      keyLastFour: "1234",
      keyCiphertext: "encrypted",
      accountId: "account-1",
      orderId: "order-1",
      orderItemId: "item-1",
      productId: "product-1",
      editionId: "edition-1",
      purchasePlanId: "plan-1",
      subscriptionId: null,
      maxSeats: 3,
      maxDevicesPerSeat: 2,
      expiresAt: null,
      eventMetadata: { planType: "PERPETUAL" },
    });
  });

  it("passes Commerce period facts and payment evidence to renewal persistence", async () => {
    const periodStart = new Date("2026-10-01T00:00:00.000Z");
    const periodEnd = new Date("2026-11-01T00:00:00.000Z");
    const effectiveAt = new Date("2026-09-12T00:00:00.000Z");
    const renewSubscription = vi.fn().mockResolvedValue({
      licenses: [{ ...issuedLicense, subscriptionId: "subscription-1", expiresAt: periodEnd }],
      renewalOperations: [{
        operationId: "renewal:order-2:license-1:none",
        licenseId: "license-1",
        deviceHash: null,
        status: "COMPLETED" as const,
        effectiveExpiry: periodEnd,
      }],
    });
    const capability = createLicensingEntitlementManagementCapability({
      issue: vi.fn(),
      renewSubscription,
    });

    const result = await capability.renewSubscription({
      subscriptionId: " subscription-1 ",
      orderId: " order-2 ",
      periodStart,
      periodEnd,
      effectiveAt,
      discountedCycleConsumed: true,
      paymentId: " payment-1 ",
      paymentEventId: " event-1 ",
    });

    expect(result.status).toBe("OK");
    expect(renewSubscription).toHaveBeenCalledWith({
      subscriptionId: "subscription-1",
      orderId: "order-2",
      periodStart,
      periodEnd,
      effectiveAt,
      discountedCycleConsumed: true,
      paymentId: "payment-1",
      paymentEventId: "event-1",
    });
  });

  it("keeps zero-license renewal as a successful no-op for V1 parity", async () => {
    const capability = createLicensingEntitlementManagementCapability({
      issue: vi.fn(),
      renewSubscription: vi.fn().mockResolvedValue({ licenses: [], renewalOperations: [] }),
    });
    await expect(capability.renewSubscription({
      subscriptionId: "subscription-1",
      orderId: "order-1",
      periodStart: new Date("2026-09-12T00:00:00.000Z"),
      periodEnd: new Date("2026-10-12T00:00:00.000Z"),
      effectiveAt: new Date("2026-09-12T00:00:00.000Z"),
      discountedCycleConsumed: false,
    })).resolves.toEqual({ status: "OK", licenses: [], renewalOperations: [] });
  });

  it("fails closed on invalid input and repository failure", async () => {
    const repository = {
      issue: vi.fn().mockRejectedValue(new Error("db unavailable")),
      renewSubscription: vi.fn(),
    };
    const capability = createLicensingEntitlementManagementCapability(repository);
    await expect(capability.issue({
      keyMaterial: { publicId: "x", keyHash: "y", keyLastFour: "123", keyCiphertext: "z" },
      accountId: "a",
      orderId: "o",
      orderItemId: "i",
      productId: "p",
      maxSeats: 1,
      maxDevicesPerSeat: 1,
    })).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });

    await expect(capability.issue({
      keyMaterial: { publicId: "public", keyHash: "hash", keyLastFour: "1234", keyCiphertext: "cipher" },
      accountId: "a",
      orderId: "o",
      orderItemId: "i",
      productId: "p",
      maxSeats: 1,
      maxDevicesPerSeat: 1,
    })).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
