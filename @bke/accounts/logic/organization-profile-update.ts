import type {
  AccountsAccountAccessCapability,
  AccountsCapability,
} from "../contracts/account-access.contract";
import type {
  AccountsOrganizationProfileUpdateCapability,
  AccountsOrganizationProfileUpdateInput,
  AccountsOrganizationProfileUpdateResult,
} from "../contracts/organization-profile-update.contract";
import type { AccountsOrganizationProfileUpdateRepository } from "./organization-profile-update-repository";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createAccountsOrganizationProfileUpdateCapability(
  accountAccess: AccountsAccountAccessCapability,
  repository: AccountsOrganizationProfileUpdateRepository,
): AccountsOrganizationProfileUpdateCapability {
  return Object.freeze({
    async update(
      input: AccountsOrganizationProfileUpdateInput,
    ): Promise<AccountsOrganizationProfileUpdateResult> {
      const actorPrincipalId = input.actorPrincipalId.trim();
      const accountId = input.accountId.trim();
      const displayName = input.displayName === undefined ? undefined : input.displayName.trim();
      const legalName = input.legalName === undefined ? undefined : input.legalName.trim();
      const billingEmail =
        input.billingEmail === undefined ? undefined : input.billingEmail.trim().toLowerCase();
      const registrationNumber =
        input.registrationNumber === undefined || input.registrationNumber === null
          ? input.registrationNumber
          : input.registrationNumber.trim();
      const taxId =
        input.taxId === undefined || input.taxId === null ? input.taxId : input.taxId.trim();

      if (
        !actorPrincipalId ||
        actorPrincipalId.length > 256 ||
        !accountId ||
        accountId.length > 256 ||
        (displayName !== undefined && (displayName.length < 2 || displayName.length > 120)) ||
        (legalName !== undefined && (legalName.length < 2 || legalName.length > 180)) ||
        (billingEmail !== undefined &&
          (billingEmail.length > 254 || !EMAIL_PATTERN.test(billingEmail))) ||
        (registrationNumber !== undefined &&
          registrationNumber !== null &&
          registrationNumber.length > 80) ||
        (taxId !== undefined && taxId !== null && taxId.length > 80)
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const organizationFieldsChanged =
        input.displayName !== undefined ||
        input.legalName !== undefined ||
        input.registrationNumber !== undefined;
      const billingFieldsChanged = input.billingEmail !== undefined || input.taxId !== undefined;
      const requiredCapabilities: AccountsCapability[] = [];
      if (organizationFieldsChanged) requiredCapabilities.push("MANAGE_MEMBERS");
      if (billingFieldsChanged) requiredCapabilities.push("VIEW_PAYMENTS");
      if (requiredCapabilities.length === 0) requiredCapabilities.push("MANAGE_MEMBERS");

      let authorizedAccount;
      for (const requiredCapability of requiredCapabilities) {
        const access = await accountAccess.authorize({
          principalId: actorPrincipalId,
          accountId,
          requiredCapability,
        });
        if (access.status === "FAILED") {
          return { status: "FAILED", code: access.code };
        }
        if (access.status === "REJECTED") {
          return { status: "REJECTED", code: access.code };
        }
        authorizedAccount ??= access.account;
      }

      if (!authorizedAccount || authorizedAccount.type !== "ORGANIZATION") {
        return { status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" };
      }
      if (
        authorizedAccount.lifecycleState === "CLOSED" ||
        authorizedAccount.lifecycleState === "CLOSURE_REQUESTED"
      ) {
        return { status: "REJECTED", code: "CLOSED_ACCOUNT" };
      }
      if (authorizedAccount.lifecycleState === "SUSPENDED") {
        return { status: "REJECTED", code: "SUSPENDED_ACCOUNT" };
      }

      try {
        const state = await repository.updateOrganizationProfile({
          accountId,
          displayName,
          legalName,
          billingEmail,
          registrationNumber,
          taxId,
        });
        return {
          status: "UPDATED",
          state,
          auditIntent: {
            action: "ORGANIZATION_PROFILE_UPDATED",
            targetType: "CustomerAccount",
            targetId: accountId,
          },
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
