import type { AccountsMemberRole } from "./account.contract";

export const ACCOUNTS_MEMBER_LEAVE_CAPABILITY_ID = "bke.accounts.member-leave.v1" as const;

export interface AccountsMemberLeaveInput {
  readonly principalId: string;
  readonly accountId: string;
}

export interface AccountsLeftMembershipSnapshot {
  readonly accountId: string;
  readonly userId: string;
  readonly role: AccountsMemberRole;
  readonly createdAt: Date;
}

export type AccountsMemberLeaveResult =
  | {
      readonly status: "LEFT";
      readonly membership: AccountsLeftMembershipSnapshot;
      readonly auditIntent: {
        readonly action: "ORGANIZATION_MEMBER_LEFT";
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
        | "OWNER_CANNOT_LEAVE"
        | "MEMBER_NOT_FOUND";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsMemberLeaveCapability {
  leave(input: AccountsMemberLeaveInput): Promise<AccountsMemberLeaveResult>;
}
