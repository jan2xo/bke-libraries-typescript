import type { AccountsMemberRole } from "../contracts/account.contract";
import type { AccountsMembershipRoleChangeSnapshot } from "../contracts/membership-role-change.contract";

export interface AccountsMembershipRoleChangeRepositoryInput {
  readonly accountId: string;
  readonly targetPrincipalId: string;
  readonly role: AccountsMemberRole;
}

export type AccountsMembershipRoleChangeRepositoryResult =
  | {
      readonly status: "UPDATED";
      readonly previousRole: AccountsMemberRole;
      readonly membership: AccountsMembershipRoleChangeSnapshot;
    }
  | {
      readonly status: "REJECTED";
      readonly code: "MEMBER_NOT_FOUND" | "LAST_OWNER_REQUIRED";
    };

export interface AccountsMembershipRoleChangeRepository {
  updateRole(
    input: AccountsMembershipRoleChangeRepositoryInput,
  ): Promise<AccountsMembershipRoleChangeRepositoryResult>;
}
