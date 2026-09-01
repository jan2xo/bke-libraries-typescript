import type { AccountsAccountSnapshot, AccountsMemberRole } from "./account.contract";

export const ACCOUNTS_OWNERSHIP_TRANSFER_CAPABILITY_ID =
  "bke.accounts.ownership-transfer.v1" as const;

export interface AccountsOwnershipTransferInput {
  readonly actorPrincipalId: string;
  readonly accountId: string;
  readonly newOwnerPrincipalId: string;
}

export interface AccountsOwnershipTransferMembershipSnapshot {
  readonly accountId: string;
  readonly userId: string;
  readonly role: AccountsMemberRole;
  readonly createdAt: Date;
}

export type AccountsOwnershipTransferAuditIntent =
  | {
      readonly action: "ORGANIZATION_OWNER_DEMOTED";
      readonly accountId: string;
      readonly targetType: "Membership";
      readonly targetId: string;
      readonly metadata: {
        readonly from: "OWNER";
        readonly to: "BILLING";
        readonly reason: "OWNERSHIP_TRANSFERRED";
      };
    }
  | {
      readonly action: "ORGANIZATION_OWNER_TRANSFERRED";
      readonly accountId: string;
      readonly targetType: "CustomerAccount";
      readonly targetId: string;
      readonly metadata: {
        readonly from: string;
        readonly to: string;
        readonly previousRole: AccountsMemberRole;
        readonly nextRole: "OWNER";
        readonly previousOwnerDemoted: true;
      };
    };

export type AccountsOwnershipTransferResult =
  | {
      readonly status: "TRANSFERRED";
      readonly account: AccountsAccountSnapshot & { readonly type: "ORGANIZATION" };
      readonly newOwnerMembership: AccountsOwnershipTransferMembershipSnapshot;
      readonly previousOwnerPrincipalId: string;
      readonly previousNewOwnerRole: AccountsMemberRole;
      readonly previousOwnerMembershipDemoted: boolean;
      readonly auditIntents: readonly [
        AccountsOwnershipTransferAuditIntent,
        AccountsOwnershipTransferAuditIntent,
      ];
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "NOT_FOUND"
        | "ACCOUNT_ROLE_FORBIDDEN"
        | "ACCOUNT_NOT_ORGANIZATION"
        | "CLOSED_ACCOUNT"
        | "SUSPENDED_ACCOUNT"
        | "MEMBER_NOT_FOUND";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsOwnershipTransferCapability {
  transfer(input: AccountsOwnershipTransferInput): Promise<AccountsOwnershipTransferResult>;
}
