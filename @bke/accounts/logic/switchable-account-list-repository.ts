import type { AccountsMemberRole } from "../contracts/account.contract";
import type { AccountsSwitchableAccountListItem } from "../contracts/switchable-account-list.contract";

export interface AccountsSwitchableAccountRecord {
  readonly account: Omit<AccountsSwitchableAccountListItem, "effectiveRole"> & {
    readonly ownerId: string;
  };
  readonly membershipRole: AccountsMemberRole | null;
}

export interface AccountsSwitchableAccountListRepository {
  listSwitchable(principalId: string): Promise<readonly AccountsSwitchableAccountRecord[]>;
}
