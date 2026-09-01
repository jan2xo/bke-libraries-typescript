import type { AccountsAccountSnapshot } from "../contracts/account.contract";

export interface AccountsIndividualAccountCreationRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly displayName: string;
  readonly billingEmail: string;
}

export interface AccountsIndividualAccountCreationRepository {
  createIndividualAccount(
    record: AccountsIndividualAccountCreationRecord,
  ): Promise<AccountsAccountSnapshot & { readonly type: "INDIVIDUAL" }>;
}
