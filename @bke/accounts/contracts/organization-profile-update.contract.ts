import type { AccountsAccountSnapshot } from "./account.contract";

export const ACCOUNTS_ORGANIZATION_PROFILE_UPDATE_CAPABILITY_ID =
  "bke.accounts.organization-profile-update.v1" as const;

export interface AccountsOrganizationProfileUpdateInput {
  readonly actorPrincipalId: string;
  readonly accountId: string;
  readonly displayName?: string;
  readonly legalName?: string;
  readonly billingEmail?: string;
  readonly registrationNumber?: string | null;
  readonly taxId?: string | null;
}

export interface AccountsOrganizationProfileUpdateSnapshot {
  readonly account: AccountsAccountSnapshot & { readonly type: "ORGANIZATION" };
  readonly organization: {
    readonly accountId: string;
    readonly legalName: string;
    readonly registrationNumber: string | null;
  };
}

export interface AccountsOrganizationProfileUpdateAuditIntent {
  readonly action: "ORGANIZATION_PROFILE_UPDATED";
  readonly targetType: "CustomerAccount";
  readonly targetId: string;
}

export type AccountsOrganizationProfileUpdateResult =
  | {
      readonly status: "UPDATED";
      readonly state: AccountsOrganizationProfileUpdateSnapshot;
      readonly auditIntent: AccountsOrganizationProfileUpdateAuditIntent;
    }
  | {
      readonly status: "REJECTED";
      readonly code:
        | "NOT_FOUND"
        | "ACCOUNT_ROLE_FORBIDDEN"
        | "ACCOUNT_NOT_ORGANIZATION"
        | "CLOSED_ACCOUNT"
        | "SUSPENDED_ACCOUNT";
    }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsOrganizationProfileUpdateCapability {
  update(
    input: AccountsOrganizationProfileUpdateInput,
  ): Promise<AccountsOrganizationProfileUpdateResult>;
}
