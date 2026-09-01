import type { AccountsRemovedMembershipSnapshot } from "../contracts/membership-removal.contract";

export interface AccountsMembershipRemovalRepositoryInput {
  readonly accountId: string;
  readonly targetPrincipalId: string;
}

export type AccountsMembershipRemovalRepositoryResult =
  | {
      readonly status: "REMOVED";
      readonly membership: AccountsRemovedMembershipSnapshot;
    }
  | {
      readonly status: "REJECTED";
      readonly code: "MEMBER_NOT_FOUND" | "LAST_OWNER_REQUIRED";
    };

export interface AccountsMembershipRemovalRepository {
  remove(
    input: AccountsMembershipRemovalRepositoryInput,
  ): Promise<AccountsMembershipRemovalRepositoryResult>;
}
