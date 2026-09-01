import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import type {
  AccountsMemberLeaveCapability,
  AccountsMemberLeaveInput,
  AccountsMemberLeaveResult,
} from "../contracts/member-leave.contract";
import type { AccountsMemberLeaveRepository } from "./member-leave-repository";

export function createAccountsMemberLeaveCapability(
  accountAccess: AccountsAccountAccessCapability,
  repository: AccountsMemberLeaveRepository,
): AccountsMemberLeaveCapability {
  return Object.freeze({
    async leave(input: AccountsMemberLeaveInput): Promise<AccountsMemberLeaveResult> {
      const principalId = input.principalId.trim();
      const accountId = input.accountId.trim();

      if (
        !principalId ||
        principalId.length > 256 ||
        !accountId ||
        accountId.length > 256
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const access = await accountAccess.authorize({ principalId, accountId });
      if (access.status === "FAILED") return { status: "FAILED", code: access.code };
      if (access.status === "REJECTED") return { status: "REJECTED", code: access.code };
      if (access.account.type !== "ORGANIZATION") {
        return { status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" };
      }
      if (access.effectiveRole === "OWNER") {
        return { status: "REJECTED", code: "OWNER_CANNOT_LEAVE" };
      }

      try {
        const result = await repository.leave({ accountId, principalId });
        if (result.status === "REJECTED") return result;
        return {
          status: "LEFT",
          membership: result.membership,
          auditIntent: {
            action: "ORGANIZATION_MEMBER_LEFT",
            accountId,
            targetType: "Membership",
            targetId: principalId,
          },
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
