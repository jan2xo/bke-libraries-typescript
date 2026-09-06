import type { CommercialLicenseContext } from "../contracts/commercial-lease.contract";
import type { LicensingLicenseLookup } from "../contracts/license-lookup.contract";
import type { CommercialLicenseContextProvider } from "./commercial-lease-ports";

type AccountLifecycleResult =
  | { readonly status: "FOUND"; readonly value: { readonly accountId: string; readonly lifecycleState: string } }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: string };

type SubscriptionStatusResult =
  | { readonly status: "FOUND"; readonly subscription: { readonly id: string; readonly status: string } }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: string };

type CatalogVersionFactsResult =
  | {
      readonly status: "FOUND";
      readonly value: {
        readonly catalogProductId: string;
        readonly externalProductId: string | null;
        readonly minimumAcceptedVersion: string | null;
        readonly maximumAcceptedVersion: string | null;
        readonly requestedVersion: string;
        readonly versionEligible: boolean;
      };
    }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: string };

export type CommercialLicenseContextDependencies = Readonly<{
  licenses: LicensingLicenseLookup;
  accounts: {
    findByAccountId(accountId: string): Promise<AccountLifecycleResult>;
  };
  subscriptions: {
    find(input: { readonly subscriptionId: string }): Promise<SubscriptionStatusResult>;
  };
  catalog: {
    findForCommercialLicensing(input: {
      readonly catalogProductId: string;
      readonly requestedVersion: string;
    }): Promise<CatalogVersionFactsResult>;
  };
}>;

function requireOwnerResult<T extends { readonly status: string }>(result: T): T {
  if (result.status === "FAILED") throw new Error("COMMERCIAL_CONTEXT_UNAVAILABLE");
  return result;
}

export function createCommercialLicenseContextProvider(
  dependencies: CommercialLicenseContextDependencies,
): CommercialLicenseContextProvider {
  return Object.freeze({
    async resolve(input: Readonly<{ licenseKeyHash: string; productVersion: string }>): Promise<CommercialLicenseContext | null> {
      const license = await dependencies.licenses.findByKeyHash({
        licenseKeyHash: input.licenseKeyHash,
      });
      if (!license) return null;

      const account = requireOwnerResult(
        await dependencies.accounts.findByAccountId(license.accountId),
      );
      if (account.status !== "FOUND") return null;

      let subscriptionStatus: string | null = null;
      if (license.subscriptionId) {
        const subscription = requireOwnerResult(
          await dependencies.subscriptions.find({ subscriptionId: license.subscriptionId }),
        );
        if (subscription.status === "FOUND") subscriptionStatus = subscription.subscription.status;
      }

      const catalog = requireOwnerResult(
        await dependencies.catalog.findForCommercialLicensing({
          catalogProductId: license.productId,
          requestedVersion: input.productVersion,
        }),
      );
      if (catalog.status !== "FOUND") return null;

      return Object.freeze({
        licenseId: license.id,
        orderItemId: license.orderItemId,
        licenseStatus: license.status,
        licenseExpiresAt: license.expiresAt,
        accountLifecycleState: account.value.lifecycleState,
        subscriptionStatus,
        productId: catalog.value.externalProductId,
        productVersionEligible: catalog.value.versionEligible,
        minimumAcceptedVersion: catalog.value.minimumAcceptedVersion,
        maximumAcceptedVersion: catalog.value.maximumAcceptedVersion,
        maxSeats: license.maxSeats,
        maxDevicesPerSeat: license.maxDevicesPerSeat,
      });
    },
  });
}
