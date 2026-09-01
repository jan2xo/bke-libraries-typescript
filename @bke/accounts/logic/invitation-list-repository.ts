import type { AccountsInvitationListItem } from "../contracts/invitation-list.contract";

export interface AccountsInvitationListRepository {
  listByAccountId(accountId: string): Promise<readonly AccountsInvitationListItem[]>;
}
