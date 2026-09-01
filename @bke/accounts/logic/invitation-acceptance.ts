import type {
  AccountsInvitationAcceptanceCapability,
  AccountsInvitationAcceptanceInput,
  AccountsInvitationAcceptanceResult,
} from "../contracts/invitation-acceptance.contract";
import type { AccountsClock } from "./accounts-clock";
import type { AccountsInvitationAcceptanceRepository } from "./invitation-acceptance-repository";
import type { AccountsInvitationTokenHasher } from "./invitation-token-hasher";

export function createAccountsInvitationAcceptanceCapability(
  repository: AccountsInvitationAcceptanceRepository,
  tokenHasher: AccountsInvitationTokenHasher,
  clock: AccountsClock,
): AccountsInvitationAcceptanceCapability {
  return Object.freeze({
    async accept(
      input: AccountsInvitationAcceptanceInput,
    ): Promise<AccountsInvitationAcceptanceResult> {
      if (
        !input ||
        typeof input.principalId !== "string" ||
        input.principalId.trim().length === 0 ||
        typeof input.email !== "string" ||
        input.email.length === 0 ||
        typeof input.token !== "string" ||
        input.token.length === 0
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let tokenHash: string;
      try {
        tokenHash = tokenHasher.hash(input.token);
        if (!tokenHash) return { status: "FAILED", code: "TOKEN_HASH_UNAVAILABLE" };
      } catch {
        return { status: "FAILED", code: "TOKEN_HASH_UNAVAILABLE" };
      }

      let now: Date;
      try {
        const generated = clock.now();
        if (!(generated instanceof Date) || Number.isNaN(generated.getTime())) {
          return { status: "FAILED", code: "CLOCK_UNAVAILABLE" };
        }
        now = new Date(generated.getTime());
      } catch {
        return { status: "FAILED", code: "CLOCK_UNAVAILABLE" };
      }

      try {
        const result = await repository.accept({
          principalId: input.principalId,
          email: input.email.toLowerCase(),
          tokenHash,
          now,
        });
        if (result.status === "REJECTED") return result;
        return {
          status: "ACCEPTED",
          membership: result.membership,
          auditIntent: {
            action: "ORGANIZATION_INVITATION_ACCEPTED",
            accountId: result.membership.accountId,
            targetType: "Membership",
            targetId: input.principalId,
            invitationId: result.invitationId,
            role: result.membership.role,
          },
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
