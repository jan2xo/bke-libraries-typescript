import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import type {
  AccountsOrganizationDetailCapability,
  AccountsOrganizationDetailInput,
  AccountsOrganizationDetailResult,
} from "../contracts/organization-detail.contract";
import { roleHasAccountsCapability } from "./account-authorization-policy";
import type { AccountsOrganizationDetailRepository } from "./organization-detail-repository";

export function createAccountsOrganizationDetailCapability(
  accountAccess: AccountsAccountAccessCapability,
  repository: AccountsOrganizationDetailRepository,
): AccountsOrganizationDetailCapability {
  return Object.freeze({
    async get(
      input: AccountsOrganizationDetailInput,
    ): Promise<AccountsOrganizationDetailResult> {
      const principalId = input.principalId.trim();
      const accountId = input.accountId.trim();
      if (!principalId || principalId.length > 256 || !accountId || accountId.length > 256) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const access = await accountAccess.authorize({ principalId, accountId });
      if (access.status === "FAILED") return { status: "FAILED", code: access.code };
      if (access.status === "REJECTED") return { status: "REJECTED", code: access.code };
      if (access.account.type !== "ORGANIZATION") {
        return { status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" };
      }

      const canManageMembers = roleHasAccountsCapability(access.effectiveRole, "MANAGE_MEMBERS");
      const canViewBilling = roleHasAccountsCapability(access.effectiveRole, "VIEW_PAYMENTS");
      const canViewLicenses = roleHasAccountsCapability(access.effectiveRole, "VIEW_LICENSES");

      try {
        const result = await repository.get({
          accountId,
          includeMembers: canManageMembers,
          includePendingInvitations: canManageMembers,
        });
        if (result.status === "REJECTED") return result;

        return {
          status: "FOUND",
          detail: {
            account: { ...access.account, type: "ORGANIZATION" },
            organization: result.organization,
            effectiveRole: access.effectiveRole,
            permissions: { canManageMembers, canViewBilling, canViewLicenses },
            billingEmail: canViewBilling ? access.account.billingEmail : null,
            taxId: canViewBilling ? access.account.taxId : null,
            memberships: canManageMembers ? result.memberships : [],
            pendingInvitations: canManageMembers ? result.pendingInvitations : [],
          },
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
