import type { AccountsMemberRole } from "./account.contract";

export const ACCOUNTS_INVITATION_REVOCATION_CAPABILITY_ID =
  "bke.accounts.invitation-revocation.v1" as const;

export interface AccountsInvitationRevocationInput {
  readonly actorPrincipalId: string;
  readonly invitationId: string;
}

export interface AccountsRevokedInvitationSnapshot {
  readonly id: string;
  readonly accountId: string;
  readonly email: string;
  readonly role: AccountsMemberRole;
  readonly status: "REVOKED";
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export type AccountsInvitationRevocationResult =
  | {
      readonly status: "REVOKED";
      readonly invitation: AccountsRevokedInvitationSnapshot;
      readonly auditIntent: {
        readonly action: "ORGANIZATION_INVITATION_REVOKED";
        readonly targetType: "Invitation";
        readonly targetId: string;
      };
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "INVITATION_NOT_FOUND"
        | "INVITATION_NOT_PENDING"
        | "NOT_FOUND"
        | "ACCOUNT_ROLE_FORBIDDEN"
        | "ACCOUNT_NOT_ORGANIZATION"
        | "CLOSED_ACCOUNT"
        | "SUSPENDED_ACCOUNT";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsInvitationRevocationCapability {
  revoke(input: AccountsInvitationRevocationInput): Promise<AccountsInvitationRevocationResult>;
}
