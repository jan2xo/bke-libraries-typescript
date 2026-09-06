import { describe, expect, it, vi } from "vitest";
import { createCommercialLicenseContextProvider } from "../logic/commercial-license-context";

const license = Object.freeze({
  id: "license-1",
  publicId: "public-1",
  keyLastFour: "7890",
  keyRevealedAt: null,
  accountId: "account-1",
  orderId: "order-1",
  orderItemId: "order-item-1",
  productId: "catalog-product-1",
  editionId: null,
  purchasePlanId: null,
  subscriptionId: "subscription-1",
  status: "ACTIVE" as const,
  maxSeats: 2,
  maxDevicesPerSeat: 3,
  expiresAt: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
});

function fixture() {
  const licenses = { findByKeyHash: vi.fn(async () => license) };
  const accounts = {
    findByAccountId: vi.fn(async () => ({ status: "FOUND" as const, value: { accountId: "account-1", lifecycleState: "ACTIVE" } })),
  };
  const subscriptions = {
    find: vi.fn(async () => ({ status: "FOUND" as const, subscription: { id: "subscription-1", status: "ACTIVE" } })),
  };
  const catalog = {
    findForCommercialLicensing: vi.fn(async () => ({
      status: "FOUND" as const,
      value: {
        catalogProductId: "catalog-product-1",
        externalProductId: "bke-product",
        minimumAcceptedVersion: "1.0.0",
        maximumAcceptedVersion: "2.0.0",
        requestedVersion: "1.2.3",
        versionEligible: true,
      },
    })),
  };
  return { licenses, accounts, subscriptions, catalog };
}

describe("commercial license context composition", () => {
  it("assembles only owner-domain facts and preserves version bounds", async () => {
    const dependencies = fixture();
    const provider = createCommercialLicenseContextProvider(dependencies);

    await expect(provider.resolve({ licenseKeyHash: "hash", productVersion: "1.2.3" })).resolves.toEqual({
      licenseId: "license-1",
      orderItemId: "order-item-1",
      licenseStatus: "ACTIVE",
      licenseExpiresAt: null,
      accountLifecycleState: "ACTIVE",
      subscriptionStatus: "ACTIVE",
      productId: "bke-product",
      productVersionEligible: true,
      minimumAcceptedVersion: "1.0.0",
      maximumAcceptedVersion: "2.0.0",
      maxSeats: 2,
      maxDevicesPerSeat: 3,
    });
    expect(dependencies.accounts.findByAccountId).toHaveBeenCalledWith("account-1");
    expect(dependencies.subscriptions.find).toHaveBeenCalledWith({ subscriptionId: "subscription-1" });
    expect(dependencies.catalog.findForCommercialLicensing).toHaveBeenCalledWith({ catalogProductId: "catalog-product-1", requestedVersion: "1.2.3" });
  });

  it("does not invent a subscription lookup when the license has no subscription", async () => {
    const dependencies = fixture();
    dependencies.licenses.findByKeyHash.mockResolvedValue({ ...license, subscriptionId: null });
    const result = await createCommercialLicenseContextProvider(dependencies).resolve({ licenseKeyHash: "hash", productVersion: "1.2.3" });
    expect(result?.subscriptionStatus).toBeNull();
    expect(dependencies.subscriptions.find).not.toHaveBeenCalled();
  });

  it("fails closed on missing required owner facts", async () => {
    const missingLicense = fixture();
    missingLicense.licenses.findByKeyHash.mockResolvedValue(null);
    await expect(createCommercialLicenseContextProvider(missingLicense).resolve({ licenseKeyHash: "hash", productVersion: "1.2.3" })).resolves.toBeNull();

    const missingAccount = fixture();
    missingAccount.accounts.findByAccountId.mockResolvedValue({ status: "NOT_FOUND" });
    await expect(createCommercialLicenseContextProvider(missingAccount).resolve({ licenseKeyHash: "hash", productVersion: "1.2.3" })).resolves.toBeNull();

    const missingCatalog = fixture();
    missingCatalog.catalog.findForCommercialLicensing.mockResolvedValue({ status: "NOT_FOUND" });
    await expect(createCommercialLicenseContextProvider(missingCatalog).resolve({ licenseKeyHash: "hash", productVersion: "1.2.3" })).resolves.toBeNull();
  });

  it("surfaces owner persistence failure without converting it into business policy", async () => {
    const dependencies = fixture();
    dependencies.accounts.findByAccountId.mockResolvedValue({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
    await expect(createCommercialLicenseContextProvider(dependencies).resolve({ licenseKeyHash: "hash", productVersion: "1.2.3" }))
      .rejects.toThrow("COMMERCIAL_CONTEXT_UNAVAILABLE");
  });
});
