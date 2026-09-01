export const ACCOUNTS_INVITATION_EXPIRATION_CAPABILITY_ID =
  "bke.accounts.invitation-expiration.v1" as const;

export interface AccountsInvitationExpirationInput {
  readonly now?: Date;
}

export interface AccountsExpiredInvitation {
  readonly id: string;
  readonly accountId: string;
}

export type AccountsInvitationExpirationResult =
  | {
      readonly status: "EXPIRED";
      readonly count: number;
      readonly invitations: readonly AccountsExpiredInvitation[];
      readonly auditIntents: readonly {
        readonly action: "ORGANIZATION_INVITATION_EXPIRED";
        readonly accountId: string;
        readonly targetType: "Invitation";
        readonly targetId: string;
      }[];
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "CLOCK_UNAVAILABLE" | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsInvitationExpirationCapability {
  expire(input?: AccountsInvitationExpirationInput): Promise<AccountsInvitationExpirationResult>;
}
