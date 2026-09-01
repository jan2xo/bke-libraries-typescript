import type { AccountsClosedOrganizationSnapshot } from "../contracts/organization-close.contract";

export interface AccountsOrganizationCloseRepositoryInput {
  readonly accountId: string;
  readonly closedAt: Date;
}

export type AccountsOrganizationCloseRepositoryResult =
  | {
      readonly status: "CLOSED";
      readonly account: AccountsClosedOrganizationSnapshot;
    }
  | {
      readonly status: "REJECTED";
      readonly code: "NOT_FOUND" | "ACCOUNT_NOT_ORGANIZATION";
    };

export interface AccountsOrganizationCloseRepository {
  close(
    input: AccountsOrganizationCloseRepositoryInput,
  ): Promise<AccountsOrganizationCloseRepositoryResult>;
}
