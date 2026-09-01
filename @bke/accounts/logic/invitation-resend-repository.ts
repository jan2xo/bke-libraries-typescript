import type { AccountsInvitationStatus } from "../contracts/account.contract";
import type { AccountsInvitationSnapshot } from "../contracts/invitation-issuance.contract";

export interface AccountsInvitationResendExisting {
  readonly id: string;
  readonly accountId: string;
  readonly status: AccountsInvitationStatus;
}

export interface AccountsInvitationResendUpdate {
  readonly id: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface AccountsInvitationResendRepository {
  findInvitation(invitationId: string): Promise<AccountsInvitationResendExisting | null>;
  updatePendingInvitation(
    update: AccountsInvitationResendUpdate,
  ): Promise<AccountsInvitationSnapshot | null>;
}
