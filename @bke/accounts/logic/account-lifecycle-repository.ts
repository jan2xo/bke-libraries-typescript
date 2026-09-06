import type { AccountsAccountLifecycleSnapshot } from "../contracts/account-lifecycle.contract";

export interface AccountsAccountLifecycleRepository {
  findLifecycle(accountId: string): Promise<AccountsAccountLifecycleSnapshot | null>;
}
