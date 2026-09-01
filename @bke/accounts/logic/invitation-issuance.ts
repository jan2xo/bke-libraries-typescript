import type { AccountsAccountAccessCapability } from "../contracts/account-access.contract";
import type { AccountsMemberRole } from "../contracts/account.contract";
import type {
  AccountsInvitationIssuanceCapability,
  AccountsInvitationIssuanceInput,
  AccountsInvitationIssuanceResult,
} from "../contracts/invitation-issuance.contract";
import type { AccountsClock } from "./accounts-clock";
import type { AccountsIdProvider } from "./accounts-id-provider";
import type { AccountsInvitationIssuanceRepository } from "./invitation-issuance-repository";
import type { AccountsInvitationTokenProvider } from "./invitation-token-provider";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const ROLES = new Set<AccountsMemberRole>(["OWNER", "BILLING", "LICENSE_MANAGER", "MEMBER"]);

export function createAccountsInvitationIssuanceCapability(
  accountAccess: AccountsAccountAccessCapability,
  repository: AccountsInvitationIssuanceRepository,
  idProvider: AccountsIdProvider,
  tokenProvider: AccountsInvitationTokenProvider,
  clock: AccountsClock,
): AccountsInvitationIssuanceCapability {
  return Object.freeze({
    async issue(
      input: AccountsInvitationIssuanceInput,
    ): Promise<AccountsInvitationIssuanceResult> {
      const actorPrincipalId = input.actorPrincipalId.trim();
      const accountId = input.accountId.trim();
      const email = input.email.trim().toLowerCase();
      const expiresAtOverride = input.expiresAt;

      if (
        !actorPrincipalId ||
        actorPrincipalId.length > 256 ||
        !accountId ||
        accountId.length > 256 ||
        !email ||
        email.length > 254 ||
        !EMAIL_PATTERN.test(email) ||
        !ROLES.has(input.role) ||
        (expiresAtOverride !== undefined &&
          (!(expiresAtOverride instanceof Date) || Number.isNaN(expiresAtOverride.getTime())))
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const access = await accountAccess.authorize({
        principalId: actorPrincipalId,
        accountId,
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

      let invitationId: string;
      let tokenMaterial: ReturnType<AccountsInvitationTokenProvider["issue"]>;
      let expiresAt: Date;
      try {
        invitationId = idProvider.issue();
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
        const invitation = await repository.createInvitation({
          id: invitationId,
          accountId,
          email,
          role: input.role,
          tokenHash: tokenMaterial.tokenHash,
          expiresAt,
        });
        return {
          status: "ISSUED",
          invitation,
          token: tokenMaterial.rawToken,
          auditIntent: {
            action: "ORGANIZATION_INVITATION_CREATED",
            targetType: "Invitation",
            targetId: invitation.id,
            metadata: { role: input.role },
          },
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
