import type { AccountsMemberRole } from "./account.contract";

export const ACCOUNTS_MEMBERSHIP_ROLE_CHANGE_CAPABILITY_ID =
  "bke.accounts.membership-role-change.v1" as const;

export interface AccountsMembershipRoleChangeInput {
  readonly actorPrincipalId: string;
  readonly accountId: string;
  readonly targetPrincipalId: string;
  readonly role: AccountsMemberRole;
}

export interface AccountsMembershipRoleChangeSnapshot {
  readonly accountId: string;
  readonly userId: string;
  readonly role: AccountsMemberRole;
  readonly createdAt: Date;
}

export type AccountsMembershipRoleChangeResult =
  | {
      readonly status: "UPDATED";
      readonly membership: AccountsMembershipRoleChangeSnapshot;
      readonly auditIntent: {
        readonly action: "ORGANIZATION_MEMBER_ROLE_UPDATED";
        readonly accountId: string;
        readonly targetType: "Membership";
        readonly targetId: string;
        readonly from: AccountsMemberRole;
        readonly to: AccountsMemberRole;
      };
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "NOT_FOUND"
        | "ACCOUNT_ROLE_FORBIDDEN"
        | "ACCOUNT_NOT_ORGANIZATION"
        | "CLOSED_ACCOUNT"
        | "SUSPENDED_ACCOUNT"
        | "MEMBER_NOT_FOUND"
        | "LAST_OWNER_REQUIRED";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsMembershipRoleChangeCapability {
  update(input: AccountsMembershipRoleChangeInput): Promise<AccountsMembershipRoleChangeResult>;
}
