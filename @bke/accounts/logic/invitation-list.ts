import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import type { AccountsInvitationExpirationCapability } from "../contracts/invitation-expiration.contract";
import type {
  AccountsInvitationListCapability,
  AccountsInvitationListExpiration,
  AccountsInvitationListInput,
  AccountsInvitationListResult,
} from "../contracts/invitation-list.contract";
import type { AccountsInvitationListRepository } from "./invitation-list-repository";

export function createAccountsInvitationListCapability(
  expiration: AccountsInvitationExpirationCapability,
  accountAccess: AccountsAccountAccessCapability,
  repository: AccountsInvitationListRepository,
): AccountsInvitationListCapability {
  return Object.freeze({
    async list(input: AccountsInvitationListInput): Promise<AccountsInvitationListResult> {
      const actorPrincipalId = input.actorPrincipalId.trim();
      const accountId = input.accountId.trim();
      if (!actorPrincipalId || !accountId) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const expirationResult = await expiration.expire();
      if (expirationResult.status !== "EXPIRED") {
        return { status: "FAILED", code: "EXPIRATION_UNAVAILABLE" };
      }
      const expirationSummary: AccountsInvitationListExpiration = {
        count: expirationResult.count,
        auditIntents: expirationResult.auditIntents,
      };

      const access = await accountAccess.authorize({
        principalId: actorPrincipalId,
        accountId,
        requiredCapability: "MANAGE_MEMBERS",
      });
      if (access.status === "REJECTED") {
        return { status: "REJECTED", code: access.code, expiration: expirationSummary };
      }
      if (access.status === "FAILED") {
        return {
          status: "FAILED",
          code: "PERSISTENCE_UNAVAILABLE",
          expiration: expirationSummary,
        };
      }
      if (access.account.type !== "ORGANIZATION") {
        return {
          status: "REJECTED",
          code: "ACCOUNT_NOT_ORGANIZATION",
          expiration: expirationSummary,
        };
      }

      try {
        const invitations = await repository.listByAccountId(accountId);
        return {
          status: "LISTED",
          invitations,
          expiration: expirationSummary,
        };
      } catch {
        return {
          status: "FAILED",
          code: "PERSISTENCE_UNAVAILABLE",
          expiration: expirationSummary,
        };
      }
    },
  });
}
