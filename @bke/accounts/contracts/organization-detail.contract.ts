import type {
  AccountsAccountSnapshot,
  AccountsMemberRole,
} from "./account.contract";

export const ACCOUNTS_ORGANIZATION_DETAIL_CAPABILITY_ID =
  "bke.accounts.organization-detail.v1" as const;

export interface AccountsOrganizationDetailInput {
  readonly principalId: string;
  readonly accountId: string;
}

export interface AccountsOrganizationProfileSnapshot {
  readonly legalName: string;
  readonly registrationNumber: string | null;
}

export interface AccountsOrganizationMemberSnapshot {
  readonly principalId: string;
  readonly role: AccountsMemberRole;
}

export interface AccountsOrganizationPendingInvitationSnapshot {
  readonly id: string;
  readonly email: string;
  readonly role: AccountsMemberRole;
  readonly status: "PENDING";
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface AccountsOrganizationDetailSnapshot {
  readonly account: AccountsAccountSnapshot & { readonly type: "ORGANIZATION" };
  readonly organization: AccountsOrganizationProfileSnapshot;
  readonly effectiveRole: AccountsMemberRole;
  readonly permissions: {
    readonly canManageMembers: boolean;
    readonly canViewBilling: boolean;
    readonly canViewLicenses: boolean;
  };
  readonly billingEmail: string | null;
  readonly taxId: string | null;
  readonly memberships: readonly AccountsOrganizationMemberSnapshot[];
  readonly pendingInvitations: readonly AccountsOrganizationPendingInvitationSnapshot[];
}

export type AccountsOrganizationDetailResult =
  | { readonly status: "FOUND"; readonly detail: AccountsOrganizationDetailSnapshot }
  | {
      readonly status: "REJECTED";
      readonly code: "NOT_FOUND" | "ACCOUNT_ROLE_FORBIDDEN" | "ACCOUNT_NOT_ORGANIZATION";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsOrganizationDetailCapability {
  get(input: AccountsOrganizationDetailInput): Promise<AccountsOrganizationDetailResult>;
}
