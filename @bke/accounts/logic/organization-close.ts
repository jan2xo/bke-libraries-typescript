import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import type {
  AccountsOrganizationCloseCapability,
  AccountsOrganizationCloseInput,
  AccountsOrganizationCloseResult,
} from "../contracts/organization-close.contract";
import type { AccountsClock } from "./accounts-clock";
import type { AccountsOrganizationCloseRepository } from "./organization-close-repository";

export function createAccountsOrganizationCloseCapability(
  accountAccess: AccountsAccountAccessCapability,
  repository: AccountsOrganizationCloseRepository,
  clock: AccountsClock,
): AccountsOrganizationCloseCapability {
  return Object.freeze({
    async close(
      input: AccountsOrganizationCloseInput,
    ): Promise<AccountsOrganizationCloseResult> {
      const actorPrincipalId = input.actorPrincipalId.trim();
      const accountId = input.accountId.trim();
      if (
        !actorPrincipalId ||
        actorPrincipalId.length > 256 ||
        !accountId ||
        accountId.length > 256
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const access = await accountAccess.authorize({
        principalId: actorPrincipalId,
        accountId,
        requiredCapability: "CLOSE_ACCOUNT",
      });
      if (access.status === "FAILED") return { status: "FAILED", code: access.code };
      if (access.status === "REJECTED") return { status: "REJECTED", code: access.code };
      if (access.account.type !== "ORGANIZATION") {
        return { status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" };
      }

      try {
        const result = await repository.close({ accountId, closedAt: clock.now() });
        if (result.status === "REJECTED") return result;
        return {
          status: "CLOSED",
          account: result.account,
          auditIntent: {
            action: "ORGANIZATION_CLOSED",
            accountId,
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
