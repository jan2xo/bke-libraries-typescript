import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import type {
  AccountsMembershipRemovalCapability,
  AccountsMembershipRemovalInput,
  AccountsMembershipRemovalResult,
} from "../contracts/membership-removal.contract";
import type { AccountsMembershipRemovalRepository } from "./membership-removal-repository";

export function createAccountsMembershipRemovalCapability(
  accountAccess: AccountsAccountAccessCapability,
  repository: AccountsMembershipRemovalRepository,
): AccountsMembershipRemovalCapability {
  return Object.freeze({
    async remove(input: AccountsMembershipRemovalInput): Promise<AccountsMembershipRemovalResult> {
      const actorPrincipalId = input.actorPrincipalId.trim();
      const accountId = input.accountId.trim();
      const targetPrincipalId = input.targetPrincipalId.trim();

      if (
        !actorPrincipalId ||
        actorPrincipalId.length > 256 ||
        !accountId ||
        accountId.length > 256 ||
        !targetPrincipalId ||
        targetPrincipalId.length > 256
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const access = await accountAccess.authorize({
        principalId: actorPrincipalId,
        accountId,
        requiredCapability: "MANAGE_MEMBERS",
      });
      if (access.status === "FAILED") return { status: "FAILED", code: access.code };
      if (access.status === "REJECTED") return { status: "REJECTED", code: access.code };
      if (access.account.type !== "ORGANIZATION") {
        return { status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" };
      }
      if (
        access.account.lifecycleState === "CLOSED" ||
        access.account.lifecycleState === "CLOSURE_REQUESTED"
      ) {
        return { status: "REJECTED", code: "CLOSED_ACCOUNT" };
      }
      if (access.account.lifecycleState === "SUSPENDED") {
        return { status: "REJECTED", code: "SUSPENDED_ACCOUNT" };
      }

      try {
        const result = await repository.remove({ accountId, targetPrincipalId });
        if (result.status === "REJECTED") return result;
        return {
          status: "REMOVED",
          membership: result.membership,
          auditIntent: {
            action: "ORGANIZATION_MEMBER_REMOVED",
            accountId,
            targetType: "Membership",
            targetId: targetPrincipalId,
          },
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
