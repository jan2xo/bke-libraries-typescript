import type { AccountsLeftMembershipSnapshot } from "../contracts/member-leave.contract";

export interface AccountsMemberLeaveRepositoryInput {
  readonly accountId: string;
  readonly principalId: string;
}

export type AccountsMemberLeaveRepositoryResult =
  | { readonly status: "LEFT"; readonly membership: AccountsLeftMembershipSnapshot }
  | {
      readonly status: "REJECTED";
      readonly code: "MEMBER_NOT_FOUND" | "OWNER_CANNOT_LEAVE";
    };

export interface AccountsMemberLeaveRepository {
  leave(input: AccountsMemberLeaveRepositoryInput): Promise<AccountsMemberLeaveRepositoryResult>;
}
