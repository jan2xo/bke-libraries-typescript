import type { AccountsAccountSnapshot, AccountsMemberRole } from "../contracts/account.contract";

export interface AccountsAccountAccessRecord {
  readonly account: AccountsAccountSnapshot;
  readonly membershipRole: AccountsMemberRole | null;
}

export interface AccountsAccountAccessRepository {
  findAccess(principalId: string, accountId: string): Promise<AccountsAccountAccessRecord | null>;
}
