import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import type {
  AccountsInvitationRevocationCapability,
  AccountsInvitationRevocationInput,
  AccountsInvitationRevocationResult,
} from "../contracts/invitation-revocation.contract";
import type { AccountsInvitationRevocationRepository } from "./invitation-revocation-repository";

export function createAccountsInvitationRevocationCapability(
  accountAccess: AccountsAccountAccessCapability,
  repository: AccountsInvitationRevocationRepository,
): AccountsInvitationRevocationCapability {
  return Object.freeze({
    async revoke(
      input: AccountsInvitationRevocationInput,
    ): Promise<AccountsInvitationRevocationResult> {
      const actorPrincipalId = input.actorPrincipalId.trim();
      const invitationId = input.invitationId.trim();
      if (
        !actorPrincipalId ||
        actorPrincipalId.length > 256 ||
        !invitationId ||
        invitationId.length > 256
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let existing;
      try {
        existing = await repository.findInvitation(invitationId);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
      if (!existing) {
        return { status: "REJECTED", code: "INVITATION_NOT_FOUND" };
      }

      const access = await accountAccess.authorize({
        principalId: actorPrincipalId,
        accountId: existing.accountId,
        requiredCapability: "MANAGE_MEMBERS",
      });
      if (access.status === "FAILED") {
        return { status: "FAILED", code: access.code };
      }
      if (access.status === "REJECTED") {
        return { status: "REJECTED", code: access.code };
      }
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
      if (existing.status !== "PENDING") {
        return { status: "REJECTED", code: "INVITATION_NOT_PENDING" };
      }

      try {
        const invitation = await repository.revokePendingInvitation(existing.id);
        if (!invitation) {
          return { status: "REJECTED", code: "INVITATION_NOT_PENDING" };
        }
        return {
          status: "REVOKED",
          invitation,
          auditIntent: {
            action: "ORGANIZATION_INVITATION_REVOKED",
            targetType: "Invitation",
            targetId: invitation.id,
          },
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
