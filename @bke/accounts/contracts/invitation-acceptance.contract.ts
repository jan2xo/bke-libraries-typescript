import type { AccountsMemberRole } from "./account.contract";

export const ACCOUNTS_INVITATION_ACCEPTANCE_CAPABILITY_ID =
  "bke.accounts.invitation-acceptance.v1" as const;

export interface AccountsInvitationAcceptanceInput {
  readonly principalId: string;
  readonly email: string;
  readonly token: string;
}

export interface AccountsAcceptedMembershipSnapshot {
  readonly accountId: string;
  readonly userId: string;
  readonly role: AccountsMemberRole;
  readonly createdAt: Date;
}

export type AccountsInvitationAcceptanceResult =
  | {
      readonly status: "ACCEPTED";
      readonly membership: AccountsAcceptedMembershipSnapshot;
      readonly auditIntent: {
        readonly action: "ORGANIZATION_INVITATION_ACCEPTED";
        readonly accountId: string;
        readonly targetType: "Membership";
        readonly targetId: string;
        readonly invitationId: string;
        readonly role: AccountsMemberRole;
      };
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "INVITATION_NOT_FOUND"
        | "INVITATION_NOT_PENDING"
        | "INVITATION_EXPIRED"
        | "INVITATION_EMAIL_MISMATCH"
        | "ACCOUNT_NOT_ORGANIZATION"
        | "CLOSED_ACCOUNT"
        | "SUSPENDED_ACCOUNT";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "TOKEN_HASH_UNAVAILABLE"
        | "CLOCK_UNAVAILABLE"
        | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsInvitationAcceptanceCapability {
  accept(input: AccountsInvitationAcceptanceInput): Promise<AccountsInvitationAcceptanceResult>;
}
