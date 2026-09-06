import { describe, expect, it } from "vitest";
import type { LicensingLicenseSnapshot } from "../contracts/license.contract";
import {
  createCommercialLicenseContextProvider,
  type CommercialLicenseContextDependencies,
} from "../logic/commercial-license-context";

const license: LicensingLicenseSnapshot = Object.freeze({
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
  status: "ACTIVE",
  maxSeats: 2,
  maxDevicesPerSeat: 3,
  expiresAt: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
});

type AccountResult = Awaited<ReturnType<CommercialLicenseContextDependencies["accounts"]["findByAccountId"]>>;
type SubscriptionResult = Awaited<ReturnType<CommercialLicenseContextDependencies["subscriptions"]["find"]>>;
type CatalogResult = Awaited<ReturnType<CommercialLicenseContextDependencies["catalog"]["findForCommercialLicensing"]>>;

function fixture() {
  let currentLicense: LicensingLicenseSnapshot | null = license;
  let accountResult: AccountResult = {
    status: "FOUND",
    value: { accountId: "account-1", lifecycleState: "ACTIVE" },
  };
  let subscriptionResult: SubscriptionResult = {
    status: "FOUND",
    subscription: { id: "subscription-1", status: "ACTIVE" },
  };
  let catalogResult: CatalogResult = {
    status: "FOUND",
    value: {
      catalogProductId: "catalog-product-1",
      externalProductId: "bke-product",
      minimumAcceptedVersion: "1.0.0",
      maximumAcceptedVersion: "2.0.0",
      requestedVersion: "1.2.3",
      versionEligible: true,
    },
  };

  const calls = {
    accountIds: [] as string[],
    subscriptionIds: [] as string[],
    catalogInputs: [] as Array<{ catalogProductId: string; requestedVersion: string }>,
  };

  const dependencies: CommercialLicenseContextDependencies = {
    licenses: {
      async findByKeyHash() {
        return currentLicense;
      },
    },
    accounts: {
      async findByAccountId(accountId) {
        calls.accountIds.push(accountId);
        return accountResult;
      },
    },
    subscriptions: {
      async find(input) {
        calls.subscriptionIds.push(input.subscriptionId);
        return subscriptionResult;
      },
    },
    catalog: {
      async findForCommercialLicensing(input) {
        calls.catalogInputs.push(input);
        return catalogResult;
      },
    },
  };

  return {
    dependencies,
    calls,
    setLicense(value: LicensingLicenseSnapshot | null) {
      currentLicense = value;
    },
    setAccountResult(value: AccountResult) {
      accountResult = value;
    },
    setSubscriptionResult(value: SubscriptionResult) {
      subscriptionResult = value;
    },
    setCatalogResult(value: CatalogResult) {
      catalogResult = value;
    },
  };
}

describe("commercial license context composition", () => {
  it("assembles only owner-domain facts and preserves version bounds", async () => {
    const state = fixture();
    const provider = createCommercialLicenseContextProvider(state.dependencies);

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
    expect(state.calls.accountIds).toEqual(["account-1"]);
    expect(state.calls.subscriptionIds).toEqual(["subscription-1"]);
    expect(state.calls.catalogInputs).toEqual([
      { catalogProductId: "catalog-product-1", requestedVersion: "1.2.3" },
    ]);
  });

  it("does not invent a subscription lookup when the license has no subscription", async () => {
    const state = fixture();
    state.setLicense({ ...license, subscriptionId: null });
    const result = await createCommercialLicenseContextProvider(state.dependencies).resolve({
      licenseKeyHash: "hash",
      productVersion: "1.2.3",
    });
    expect(result?.subscriptionStatus).toBeNull();
    expect(state.calls.subscriptionIds).toEqual([]);
  });

  it("keeps a missing optional subscription as null for action policy", async () => {
    const state = fixture();
    state.setSubscriptionResult({ status: "NOT_FOUND" });
    const result = await createCommercialLicenseContextProvider(state.dependencies).resolve({
      licenseKeyHash: "hash",
      productVersion: "1.2.3",
    });
    expect(result?.subscriptionStatus).toBeNull();
  });

  it("fails closed on missing required owner facts", async () => {
    const missingLicense = fixture();
    missingLicense.setLicense(null);
    await expect(
      createCommercialLicenseContextProvider(missingLicense.dependencies).resolve({
        licenseKeyHash: "hash",
        productVersion: "1.2.3",
      }),
    ).resolves.toBeNull();

    const missingAccount = fixture();
    missingAccount.setAccountResult({ status: "NOT_FOUND" });
    await expect(
      createCommercialLicenseContextProvider(missingAccount.dependencies).resolve({
        licenseKeyHash: "hash",
        productVersion: "1.2.3",
      }),
    ).resolves.toBeNull();

    const missingCatalog = fixture();
    missingCatalog.setCatalogResult({ status: "NOT_FOUND" });
    await expect(
      createCommercialLicenseContextProvider(missingCatalog.dependencies).resolve({
        licenseKeyHash: "hash",
        productVersion: "1.2.3",
      }),
    ).resolves.toBeNull();
  });

  it("surfaces owner persistence failure without converting it into business policy", async () => {
    const state = fixture();
    state.setAccountResult({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
    await expect(
      createCommercialLicenseContextProvider(state.dependencies).resolve({
        licenseKeyHash: "hash",
        productVersion: "1.2.3",
      }),
    ).rejects.toThrow("COMMERCIAL_CONTEXT_UNAVAILABLE");
  });
});
