import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import type {
  AccountsOwnershipTransferCapability,
  AccountsOwnershipTransferInput,
  AccountsOwnershipTransferResult,
} from "../contracts/ownership-transfer.contract";
import type { AccountsOwnershipTransferRepository } from "./ownership-transfer-repository";

export function createAccountsOwnershipTransferCapability(
  accountAccess: AccountsAccountAccessCapability,
  repository: AccountsOwnershipTransferRepository,
): AccountsOwnershipTransferCapability {
  return Object.freeze({
    async transfer(
      input: AccountsOwnershipTransferInput,
    ): Promise<AccountsOwnershipTransferResult> {
      const actorPrincipalId = input.actorPrincipalId.trim();
      const accountId = input.accountId.trim();
      const newOwnerPrincipalId = input.newOwnerPrincipalId.trim();

      if (
        !actorPrincipalId ||
        actorPrincipalId.length > 256 ||
        !accountId ||
        accountId.length > 256 ||
        !newOwnerPrincipalId ||
        newOwnerPrincipalId.length > 256
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
        const result = await repository.transfer({ accountId, newOwnerPrincipalId });
        if (result.status === "REJECTED") return result;

        return {
          status: "TRANSFERRED",
          account: result.account,
          newOwnerMembership: result.newOwnerMembership,
          previousOwnerPrincipalId: result.previousOwnerPrincipalId,
          previousNewOwnerRole: result.previousNewOwnerRole,
          previousOwnerMembershipDemoted: result.previousOwnerMembershipDemoted,
          auditIntents: [
            {
              action: "ORGANIZATION_OWNER_DEMOTED",
              accountId,
              targetType: "Membership",
              targetId: result.previousOwnerPrincipalId,
              metadata: {
                from: "OWNER",
                to: "BILLING",
                reason: "OWNERSHIP_TRANSFERRED",
              },
            },
            {
              action: "ORGANIZATION_OWNER_TRANSFERRED",
              accountId,
              targetType: "CustomerAccount",
              targetId: accountId,
              metadata: {
                from: result.previousOwnerPrincipalId,
                to: newOwnerPrincipalId,
                previousRole: result.previousNewOwnerRole,
                nextRole: "OWNER",
                previousOwnerDemoted: true,
              },
            },
          ],
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
