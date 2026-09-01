import type {
  AccountsInvitationExpirationCapability,
  AccountsInvitationExpirationInput,
  AccountsInvitationExpirationResult,
} from "../contracts/invitation-expiration.contract";
import type { AccountsClock } from "./accounts-clock";
import type { AccountsInvitationExpirationRepository } from "./invitation-expiration-repository";

export function createAccountsInvitationExpirationCapability(
  repository: AccountsInvitationExpirationRepository,
  clock: AccountsClock,
): AccountsInvitationExpirationCapability {
  return Object.freeze({
    async expire(
      input: AccountsInvitationExpirationInput = {},
    ): Promise<AccountsInvitationExpirationResult> {
      let now: Date;
      if (input.now !== undefined) {
        if (!(input.now instanceof Date) || Number.isNaN(input.now.getTime())) {
          return { status: "FAILED", code: "INVALID_INPUT" };
        }
        now = new Date(input.now.getTime());
      } else {
        try {
          const generated = clock.now();
          if (!(generated instanceof Date) || Number.isNaN(generated.getTime())) {
            return { status: "FAILED", code: "CLOCK_UNAVAILABLE" };
          }
          now = new Date(generated.getTime());
        } catch {
          return { status: "FAILED", code: "CLOCK_UNAVAILABLE" };
        }
      }

      try {
        const invitations = await repository.expirePendingAt(now);
        return {
          status: "EXPIRED",
          count: invitations.length,
          invitations,
          auditIntents: invitations.map((invitation) => ({
            action: "ORGANIZATION_INVITATION_EXPIRED" as const,
            accountId: invitation.accountId,
            targetType: "Invitation" as const,
            targetId: invitation.id,
          })),
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
