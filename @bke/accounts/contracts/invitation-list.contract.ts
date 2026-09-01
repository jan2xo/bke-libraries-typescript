import type { AccountsMemberRole } from "./account.contract";

export const ACCOUNTS_INVITATION_LIST_CAPABILITY_ID =
  "bke.accounts.invitation-list.v1" as const;

export interface AccountsInvitationListInput {
  readonly actorPrincipalId: string;
  readonly accountId: string;
}

export type AccountsInvitationListStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REVOKED"
  | "EXPIRED";

export interface AccountsInvitationListItem {
  readonly id: string;
  readonly accountId: string;
  readonly email: string;
  readonly role: AccountsMemberRole;
  readonly status: AccountsInvitationListStatus;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface AccountsInvitationListExpiration {
  readonly count: number;
  readonly auditIntents: readonly {
    readonly action: "ORGANIZATION_INVITATION_EXPIRED";
    readonly accountId: string;
    readonly targetType: "Invitation";
    readonly targetId: string;
  }[];
}

export type AccountsInvitationListResult =
  | {
      readonly status: "LISTED";
      readonly invitations: readonly AccountsInvitationListItem[];
      readonly expiration: AccountsInvitationListExpiration;
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "NOT_FOUND"
        | "ACCOUNT_ROLE_FORBIDDEN"
        | "ACCOUNT_NOT_ORGANIZATION";
      readonly expiration: AccountsInvitationListExpiration;
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "EXPIRATION_UNAVAILABLE"
        | "PERSISTENCE_UNAVAILABLE";
      readonly expiration?: AccountsInvitationListExpiration;
    };

export interface AccountsInvitationListCapability {
  list(input: AccountsInvitationListInput): Promise<AccountsInvitationListResult>;
}
