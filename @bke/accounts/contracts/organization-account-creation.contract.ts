import type { AccountsAccountSnapshot } from "./account.contract";

export const ACCOUNTS_ORGANIZATION_ACCOUNT_CREATION_CAPABILITY_ID =
  "bke.accounts.organization-account-creation.v1" as const;

export interface AccountsOrganizationAccountCreationInput {
  readonly ownerPrincipalId: string;
  readonly displayName: string;
  readonly legalName: string;
  readonly billingEmail: string;
  readonly registrationNumber?: string;
  readonly taxId?: string;
}

export interface AccountsOrganizationProfileSnapshot {
  readonly accountId: string;
  readonly legalName: string;
  readonly registrationNumber: string | null;
}

export interface AccountsOrganizationOwnerMembershipSnapshot {
  readonly accountId: string;
  readonly userId: string;
  readonly role: "OWNER";
}

export interface AccountsAuditIntent {
  readonly action: "ORGANIZATION_CREATED";
  readonly targetType: "CustomerAccount";
  readonly targetId: string;
}

export type AccountsOrganizationAccountCreationResult =
  | {
      readonly status: "CREATED";
      readonly account: AccountsAccountSnapshot & { readonly type: "ORGANIZATION" };
      readonly organization: AccountsOrganizationProfileSnapshot;
      readonly ownerMembership: AccountsOrganizationOwnerMembershipSnapshot;
      readonly auditIntent: AccountsAuditIntent;
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "ID_PROVIDER_UNAVAILABLE"
        | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsOrganizationAccountCreationCapability {
  create(
    input: AccountsOrganizationAccountCreationInput,
  ): Promise<AccountsOrganizationAccountCreationResult>;
}
