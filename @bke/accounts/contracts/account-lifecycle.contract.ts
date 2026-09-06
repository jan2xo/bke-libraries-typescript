import type { AccountsLifecycleState } from "./account.contract";

export const ACCOUNTS_ACCOUNT_LIFECYCLE_CAPABILITY_ID =
  "bke.accounts.account-lifecycle.v1" as const;

export interface AccountsAccountLifecycleSnapshot {
  readonly accountId: string;
  readonly lifecycleState: AccountsLifecycleState;
}

export type AccountsAccountLifecycleResult =
  | { readonly status: "FOUND"; readonly value: AccountsAccountLifecycleSnapshot }
  | { readonly status: "NOT_FOUND" }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsAccountLifecycleCapability {
  findByAccountId(accountId: string): Promise<AccountsAccountLifecycleResult>;
}
