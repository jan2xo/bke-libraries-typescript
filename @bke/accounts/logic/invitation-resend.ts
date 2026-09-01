import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import type {
  AccountsInvitationResendCapability,
  AccountsInvitationResendInput,
  AccountsInvitationResendResult,
} from "../contracts/invitation-resend.contract";
import type { AccountsClock } from "./accounts-clock";
import type { AccountsInvitationResendRepository } from "./invitation-resend-repository";
import type { AccountsInvitationTokenProvider } from "./invitation-token-provider";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function createAccountsInvitationResendCapability(
  accountAccess: AccountsAccountAccessCapability,
  repository: AccountsInvitationResendRepository,
  tokenProvider: AccountsInvitationTokenProvider,
  clock: AccountsClock,
): AccountsInvitationResendCapability {
  return Object.freeze({
    async resend(input: AccountsInvitationResendInput): Promise<AccountsInvitationResendResult> {
      const actorPrincipalId = input.actorPrincipalId.trim();
      const invitationId = input.invitationId.trim();
      const expiresAtOverride = input.expiresAt;
      if (
        !actorPrincipalId ||
        actorPrincipalId.length > 256 ||
        !invitationId ||
        invitationId.length > 256 ||
        (expiresAtOverride !== undefined &&
          (!(expiresAtOverride instanceof Date) || Number.isNaN(expiresAtOverride.getTime())))
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

      let tokenMaterial: ReturnType<AccountsInvitationTokenProvider["issue"]>;
      let expiresAt: Date;
      try {
        tokenMaterial = tokenProvider.issue();
        if (expiresAtOverride) {
          expiresAt = new Date(expiresAtOverride.getTime());
        } else {
          const now = clock.now();
          if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
            return { status: "FAILED", code: "GENERATION_FAILED" };
          }
          expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
        }
      } catch {
        return { status: "FAILED", code: "GENERATION_FAILED" };
      }

      try {
        const invitation = await repository.updatePendingInvitation({
          id: existing.id,
          tokenHash: tokenMaterial.tokenHash,
          expiresAt,
        });
        if (!invitation) {
          return { status: "REJECTED", code: "INVITATION_NOT_PENDING" };
        }
        return {
          status: "RESENT",
          invitation,
          token: tokenMaterial.rawToken,
          auditIntent: {
            action: "ORGANIZATION_INVITATION_RESENT",
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
