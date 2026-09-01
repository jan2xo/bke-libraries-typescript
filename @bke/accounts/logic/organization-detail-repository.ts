import type {
  AccountsOrganizationMemberSnapshot,
  AccountsOrganizationPendingInvitationSnapshot,
  AccountsOrganizationProfileSnapshot,
} from "../contracts/organization-detail.contract";

export interface AccountsOrganizationDetailRepositoryInput {
  readonly accountId: string;
  readonly includeMembers: boolean;
  readonly includePendingInvitations: boolean;
}

export type AccountsOrganizationDetailRepositoryResult =
  | {
      readonly status: "FOUND";
      readonly organization: AccountsOrganizationProfileSnapshot;
      readonly memberships: readonly AccountsOrganizationMemberSnapshot[];
      readonly pendingInvitations: readonly AccountsOrganizationPendingInvitationSnapshot[];
    }
  | { readonly status: "REJECTED"; readonly code: "NOT_FOUND" | "ACCOUNT_NOT_ORGANIZATION" };

export interface AccountsOrganizationDetailRepository {
  get(
    input: AccountsOrganizationDetailRepositoryInput,
  ): Promise<AccountsOrganizationDetailRepositoryResult>;
}
