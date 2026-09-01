import type { AccountsAccountSnapshot } from "./account.contract";

export const ACCOUNTS_INDIVIDUAL_ACCOUNT_CREATION_CAPABILITY_ID =
  "bke.accounts.individual-account-creation.v1" as const;

export interface AccountsIndividualAccountCreationInput {
  readonly ownerId: string;
  readonly displayName: string;
  readonly billingEmail: string;
}

export type AccountsIndividualAccountCreationResult =
  | {
      readonly status: "CREATED";
      readonly account: AccountsAccountSnapshot & { readonly type: "INDIVIDUAL" };
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "ID_PROVIDER_UNAVAILABLE"
        | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsIndividualAccountCreationCapability {
  create(
    input: AccountsIndividualAccountCreationInput,
  ): Promise<AccountsIndividualAccountCreationResult>;
}
