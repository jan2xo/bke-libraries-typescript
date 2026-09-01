import type {
  AccountsAccountAccessCapability,
  AccountsAccountAccessInput,
  AccountsAccountAccessResult,
} from "../contracts/account-access.contract";
import type { AccountsMemberRole } from "../contracts/account.contract";
import type { AccountsAccountAccessRepository } from "./account-access-repository";
import { roleHasAccountsCapability } from "./account-authorization-policy";

export function createAccountsAccountAccessCapability(
  repository: AccountsAccountAccessRepository,
): AccountsAccountAccessCapability {
  return Object.freeze({
    async authorize(input: AccountsAccountAccessInput): Promise<AccountsAccountAccessResult> {
      const principalId = input.principalId.trim();
      const accountId = input.accountId.trim();
      if (!principalId || principalId.length > 256 || !accountId || accountId.length > 256) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let access;
      try {
        access = await repository.findAccess(principalId, accountId);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
      if (!access) {
        return { status: "REJECTED", code: "NOT_FOUND" };
      }

      const effectiveRole: AccountsMemberRole =
        access.account.ownerId === principalId ? "OWNER" : access.membershipRole ?? "MEMBER";
      if (
        input.requiredCapability &&
        !roleHasAccountsCapability(effectiveRole, input.requiredCapability)
      ) {
        return { status: "REJECTED", code: "ACCOUNT_ROLE_FORBIDDEN" };
      }

      return {
        status: "AUTHORIZED",
        account: access.account,
        effectiveRole,
      };
    },
  });
}
