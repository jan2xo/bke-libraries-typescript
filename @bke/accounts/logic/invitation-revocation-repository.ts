import type { AccountsInvitationStatus } from "../contracts/account.contract";
import type { AccountsRevokedInvitationSnapshot } from "../contracts/invitation-revocation.contract";

export interface AccountsInvitationRevocationExisting {
  readonly id: string;
  readonly accountId: string;
  readonly status: AccountsInvitationStatus;
}

export interface AccountsInvitationRevocationRepository {
  findInvitation(invitationId: string): Promise<AccountsInvitationRevocationExisting | null>;
  revokePendingInvitation(invitationId: string): Promise<AccountsRevokedInvitationSnapshot | null>;
}
