import { describe, expect, it } from "vitest";
import { createCommercialLicenseContextProvider } from "../logic/commercial-license-context";

const license = Object.freeze({
  id: "license-1",
  publicId: "public-license-1",
  keyLastFour: "1234",
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
  createdAt: new Date("2026-09-05T00:00:00.000Z"),
});

function dependencies(overrides: Partial<Parameters<typeof createCommercialLicenseContextProvider>[0]> = {}) {
  return {
    licenses: {
      async findByKeyHash(input: { readonly licenseKeyHash: string }) {
        return input.licenseKeyHash === "hash-1" ? license : null;
      },
    },
    accounts: {
      async findByAccountId(accountId: string) {
        return {
          status: "FOUND" as const,
          value: { accountId, lifecycleState: "ACTIVE" },
        };
      },
    },
    subscriptions: {
      async find(input: { readonly subscriptionId: string }) {
        return {
          status: "FOUND" as const,
          subscription: { id: input.subscriptionId, status: "ACTIVE" },
        };
      },
    },
    catalog: {
      async findForCommercialLicensing(input: {
        readonly catalogProductId: string;
        readonly requestedVersion: string;
      }) {
        return {
          status: "FOUND" as const,
          value: {
            catalogProductId: input.catalogProductId,
            externalProductId: "bke-product-1",
            minimumAcceptedVersion: "1.0.0",
            maximumAcceptedVersion: "2.0.0",
            requestedVersion: input.requestedVersion,
            versionEligible: true,
          },
        };
      },
    },
    ...overrides,
  };
}

describe("commercial license context provider", () => {
  it("assembles only owner-domain facts into the Licensing context", async () => {
    const provider = createCommercialLicenseContextProvider(dependencies());

    await expect(
      provider.resolve({ licenseKeyHash: "hash-1", productVersion: "1.2.3" }),
    ).resolves.toEqual({
      licenseId: "license-1",
      orderItemId: "order-item-1",
      licenseStatus: "ACTIVE",
      licenseExpiresAt: null,
      accountLifecycleState: "ACTIVE",
      subscriptionStatus: "ACTIVE",
      productId: "bke-product-1",
      productVersionEligible: true,
      minimumAcceptedVersion: "1.0.0",
      maximumAcceptedVersion: "2.0.0",
      maxSeats: 2,
      maxDevicesPerSeat: 3,
    });
  });

  it("returns null when the Licensing-owned license does not exist", async () => {
    const provider = createCommercialLicenseContextProvider(dependencies());
    await expect(
      provider.resolve({ licenseKeyHash: "missing", productVersion: "1.2.3" }),
    ).resolves.toBeNull();
  });

  it("returns null when a required Accounts or Catalog fact is not found", async () => {
    const accountMissing = createCommercialLicenseContextProvider(
      dependencies({
        accounts: { async findByAccountId() { return { status: "NOT_FOUND" as const }; } },
      }),
    );
    await expect(
      accountMissing.resolve({ licenseKeyHash: "hash-1", productVersion: "1.2.3" }),
    ).resolves.toBeNull();

    const catalogMissing = createCommercialLicenseContextProvider(
      dependencies({
        catalog: { async findForCommercialLicensing() { return { status: "NOT_FOUND" as const }; } },
      }),
    );
    await expect(
      catalogMissing.resolve({ licenseKeyHash: "hash-1", productVersion: "1.2.3" }),
    ).resolves.toBeNull();
  });

  it("maps owner persistence failure to a stable Licensing composition failure", async () => {
    const provider = createCommercialLicenseContextProvider(
      dependencies({
        accounts: {
          async findByAccountId() {
            return { status: "FAILED" as const, code: "PERSISTENCE_UNAVAILABLE" };
          },
        },
      }),
    );

    await expect(
      provider.resolve({ licenseKeyHash: "hash-1", productVersion: "1.2.3" }),
    ).rejects.toThrow("COMMERCIAL_CONTEXT_UNAVAILABLE");
  });

  it("keeps a missing optional subscription as null for Licensing to apply action policy later", async () => {
    const provider = createCommercialLicenseContextProvider(
      dependencies({
        subscriptions: { async find() { return { status: "NOT_FOUND" as const }; } },
      }),
    );

    const context = await provider.resolve({ licenseKeyHash: "hash-1", productVersion: "1.2.3" });
    expect(context?.subscriptionStatus).toBeNull();
  });
});
