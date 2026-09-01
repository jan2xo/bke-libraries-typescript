import type { AccountsMemberRole } from "../contracts/account.contract";
import type { AccountsInvitationSnapshot } from "../contracts/invitation-issuance.contract";

export interface AccountsInvitationIssuanceRecord {
  readonly id: string;
  readonly accountId: string;
  readonly email: string;
  readonly role: AccountsMemberRole;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface AccountsInvitationIssuanceRepository {
  createInvitation(record: AccountsInvitationIssuanceRecord): Promise<AccountsInvitationSnapshot>;
}
