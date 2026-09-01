import type { AccountsInvitationSnapshot } from "./invitation-issuance.contract";

export const ACCOUNTS_INVITATION_RESEND_CAPABILITY_ID =
  "bke.accounts.invitation-resend.v1" as const;

export interface AccountsInvitationResendInput {
  readonly actorPrincipalId: string;
  readonly invitationId: string;
  readonly expiresAt?: Date;
}

export type AccountsInvitationResendResult =
  | {
      readonly status: "RESENT";
      readonly invitation: AccountsInvitationSnapshot;
      readonly token: string;
      readonly auditIntent: {
        readonly action: "ORGANIZATION_INVITATION_RESENT";
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
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" | "GENERATION_FAILED";
    };

export interface AccountsInvitationResendCapability {
  resend(input: AccountsInvitationResendInput): Promise<AccountsInvitationResendResult>;
}
