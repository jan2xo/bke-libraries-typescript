import type { AccountsMemberRole } from "./account.contract";

export const ACCOUNTS_MEMBERSHIP_REMOVAL_CAPABILITY_ID =
  "bke.accounts.membership-removal.v1" as const;

export interface AccountsMembershipRemovalInput {
  readonly actorPrincipalId: string;
  readonly accountId: string;
  readonly targetPrincipalId: string;
}

export interface AccountsRemovedMembershipSnapshot {
  readonly accountId: string;
  readonly userId: string;
  readonly role: AccountsMemberRole;
  readonly createdAt: Date;
}

export type AccountsMembershipRemovalResult =
  | {
      readonly status: "REMOVED";
      readonly membership: AccountsRemovedMembershipSnapshot;
      readonly auditIntent: {
        readonly action: "ORGANIZATION_MEMBER_REMOVED";
        readonly accountId: string;
        readonly targetType: "Membership";
        readonly targetId: string;
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

export interface AccountsMembershipRemovalCapability {
  remove(input: AccountsMembershipRemovalInput): Promise<AccountsMembershipRemovalResult>;
}
