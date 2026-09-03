import type { AccountsAccountSnapshot, AccountsMemberRole } from "./account.contract";

export const ACCOUNTS_PURCHASE_ACCESS_CAPABILITY_ID =
  "bke.accounts.purchase-access.v1" as const;

export interface AccountsPurchaseAccessInput {
  readonly principalId: string;
  readonly accountId: string;
}

export type AccountsPurchaseAccessResult =
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

export interface AccountsPurchaseAccessCapability {
  authorize(input: AccountsPurchaseAccessInput): Promise<AccountsPurchaseAccessResult>;
}
