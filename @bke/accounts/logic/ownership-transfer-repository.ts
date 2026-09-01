import type { AccountsAccountSnapshot, AccountsMemberRole } from "../contracts/account.contract";
import type { AccountsOwnershipTransferMembershipSnapshot } from "../contracts/ownership-transfer.contract";

export interface AccountsOwnershipTransferRepositoryInput {
  readonly accountId: string;
  readonly newOwnerPrincipalId: string;
}

export type AccountsOwnershipTransferRepositoryResult =
  | {
      readonly status: "TRANSFERRED";
      readonly account: AccountsAccountSnapshot & { readonly type: "ORGANIZATION" };
      readonly newOwnerMembership: AccountsOwnershipTransferMembershipSnapshot;
      readonly previousOwnerPrincipalId: string;
      readonly previousNewOwnerRole: AccountsMemberRole;
      readonly previousOwnerMembershipDemoted: boolean;
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "NOT_FOUND"
        | "MEMBER_NOT_FOUND"
        | "ACCOUNT_NOT_ORGANIZATION"
        | "CLOSED_ACCOUNT"
        | "SUSPENDED_ACCOUNT";
    };

export interface AccountsOwnershipTransferRepository {
  transfer(
    input: AccountsOwnershipTransferRepositoryInput,
  ): Promise<AccountsOwnershipTransferRepositoryResult>;
}
