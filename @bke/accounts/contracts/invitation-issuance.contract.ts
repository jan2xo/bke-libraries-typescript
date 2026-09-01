import type { AccountsMemberRole } from "./account.contract";

export const ACCOUNTS_INVITATION_ISSUANCE_CAPABILITY_ID =
  "bke.accounts.invitation-issuance.v1" as const;

export interface AccountsInvitationIssuanceInput {
  readonly actorPrincipalId: string;
  readonly accountId: string;
  readonly email: string;
  readonly role: AccountsMemberRole;
  readonly expiresAt?: Date;
}

export interface AccountsInvitationSnapshot {
  readonly id: string;
  readonly accountId: string;
  readonly email: string;
  readonly role: AccountsMemberRole;
  readonly status: "PENDING";
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export type AccountsInvitationIssuanceResult =
  | {
      readonly status: "ISSUED";
      readonly invitation: AccountsInvitationSnapshot;
      readonly token: string;
      readonly auditIntent: {
        readonly action: "ORGANIZATION_INVITATION_CREATED";
        readonly targetType: "Invitation";
        readonly targetId: string;
        readonly metadata: { readonly role: AccountsMemberRole };
      };
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "NOT_FOUND"
        | "ACCOUNT_ROLE_FORBIDDEN"
        | "ACCOUNT_NOT_ORGANIZATION"
        | "CLOSED_ACCOUNT"
        | "SUSPENDED_ACCOUNT";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" | "GENERATION_FAILED";
    };

export interface AccountsInvitationIssuanceCapability {
  issue(input: AccountsInvitationIssuanceInput): Promise<AccountsInvitationIssuanceResult>;
}
