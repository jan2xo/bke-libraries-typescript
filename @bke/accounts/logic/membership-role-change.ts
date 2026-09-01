import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import type {
  AccountsMembershipRoleChangeCapability,
  AccountsMembershipRoleChangeInput,
  AccountsMembershipRoleChangeResult,
} from "../contracts/membership-role-change.contract";
import type { AccountsMembershipRoleChangeRepository } from "./membership-role-change-repository";

const VALID_ROLES = new Set(["OWNER", "BILLING", "LICENSE_MANAGER", "MEMBER"] as const);

export function createAccountsMembershipRoleChangeCapability(
  accountAccess: AccountsAccountAccessCapability,
  repository: AccountsMembershipRoleChangeRepository,
): AccountsMembershipRoleChangeCapability {
  return Object.freeze({
    async update(
      input: AccountsMembershipRoleChangeInput,
    ): Promise<AccountsMembershipRoleChangeResult> {
      const actorPrincipalId = input.actorPrincipalId.trim();
      const accountId = input.accountId.trim();
      const targetPrincipalId = input.targetPrincipalId.trim();
      const role = input.role;

      if (
        !actorPrincipalId ||
        actorPrincipalId.length > 256 ||
        !accountId ||
        accountId.length > 256 ||
        !targetPrincipalId ||
        targetPrincipalId.length > 256 ||
        !VALID_ROLES.has(role)
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
        const result = await repository.updateRole({ accountId, targetPrincipalId, role });
        if (result.status === "REJECTED") return result;
        return {
          status: "UPDATED",
          membership: result.membership,
          auditIntent: {
            action: "ORGANIZATION_MEMBER_ROLE_UPDATED",
            accountId,
            targetType: "Membership",
            targetId: targetPrincipalId,
            from: result.previousRole,
            to: role,
          },
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
