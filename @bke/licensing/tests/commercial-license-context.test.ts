import { describe, expect, it } from "vitest";
import type { CommercialLicenseContext } from "../contracts/commercial-lease.contract";

const context = {
  licenseId: "license-1",
  orderItemId: "order-item-1",
  licenseStatus: "ACTIVE",
  licenseExpiresAt: null,
  accountLifecycleState: "ACTIVE",
  subscriptionStatus: "ACTIVE",
  productId: "product-1",
  productVersionEligible: true,
  versionAccepted: true,
  maxSeats: 1,
  maxDevicesPerSeat: 1,
} satisfies CommercialLicenseContext;

describe("CommercialLicenseContext transfer composition facts", () => {
  it("carries the license-owned order item id required by the V1 transfer gate", () => {
    expect(context.orderItemId).toBe("order-item-1");
  });
});
