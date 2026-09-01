import type { AccountsAccountType, AccountsMemberRole } from "./account.contract";

export const ACCOUNTS_SWITCHABLE_ACCOUNT_LIST_CAPABILITY_ID =
  "bke.accounts.switchable-account-list.v1" as const;

export interface AccountsSwitchableAccountListInput {
  readonly principalId: string;
}

export interface AccountsSwitchableAccountListItem {
  readonly id: string;
  readonly type: AccountsAccountType;
  readonly displayName: string;
  readonly lifecycleState: "ACTIVE";
  readonly effectiveRole: AccountsMemberRole;
}

export type AccountsSwitchableAccountListResult =
  | {
      readonly status: "LISTED";
      readonly accounts: readonly AccountsSwitchableAccountListItem[];
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsSwitchableAccountListCapability {
  list(input: AccountsSwitchableAccountListInput): Promise<AccountsSwitchableAccountListResult>;
}
