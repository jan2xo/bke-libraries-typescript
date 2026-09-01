import type { AccountsAcceptedMembershipSnapshot } from "../contracts/invitation-acceptance.contract";

export interface AccountsInvitationAcceptanceRepositoryInput {
  readonly principalId: string;
  readonly email: string;
  readonly tokenHash: string;
  readonly now: Date;
}

export type AccountsInvitationAcceptanceRepositoryResult =
  | {
      readonly status: "ACCEPTED";
      readonly invitationId: string;
      readonly membership: AccountsAcceptedMembershipSnapshot;
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
    };

export interface AccountsInvitationAcceptanceRepository {
  accept(
    input: AccountsInvitationAcceptanceRepositoryInput,
  ): Promise<AccountsInvitationAcceptanceRepositoryResult>;
}
