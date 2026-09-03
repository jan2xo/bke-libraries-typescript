import type { AccountsAccountSnapshot, AccountsMemberRole } from "./account.contract";

export const ACCOUNTS_ACCOUNT_ACCESS_CAPABILITY_ID =
  "bke.accounts.account-access.v1" as const;

export type AccountsCapability =
  | "VIEW_ORDERS"
  | "VIEW_INVOICES"
  | "VIEW_PAYMENTS"
  | "PURCHASE"
  | "RENEW"
  | "CANCEL_PENDING_ORDER"
  | "VIEW_SUBSCRIPTIONS"
  | "VIEW_LICENSES"
  | "REVEAL_LICENSE"
  | "ASSIGN_LICENSE"
  | "DEACTIVATE_DEVICE"
  | "DOWNLOAD_INSTALLER"
  | "START_TRIAL"
  | "MANAGE_MEMBERS"
  | "CLOSE_ACCOUNT";

export interface AccountsAccountAccessInput {
  readonly principalId: string;
  readonly accountId: string;
  readonly requiredCapability?: AccountsCapability;
}

export type AccountsAccountAccessResult =
  | {
      readonly status: "AUTHORIZED";
      readonly account: AccountsAccountSnapshot;
      readonly effectiveRole: AccountsMemberRole;
    }
  | {
      readonly status: "REJECTED";
      readonly code: "NOT_FOUND" | "ACCOUNT_ROLE_FORBIDDEN" | "ACCOUNT_NOT_ACTIVE";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsAccountAccessCapability {
  authorize(input: AccountsAccountAccessInput): Promise<AccountsAccountAccessResult>;
}
