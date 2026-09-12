export const ACCOUNTS_CUSTOMER_RETENTION_POLICY_CAPABILITY_ID =
  "bke.accounts.customer-retention-policy.v1" as const;

export const ACCOUNTS_CUSTOMER_RETENTION_BLOCKERS = [
  "ADMINISTRATOR_PROTECTED",
  "ORGANIZATION_OWNER_TRANSFER_REQUIRED",
  "ACTIVE_SUBSCRIPTION",
  "UNRESOLVED_PAYMENT_OR_REFUND",
  "LEGAL_HOLD",
  "RETENTION_PERIOD_ACTIVE",
  "IMMUTABLE_LEGAL_ACCEPTANCE",
  "PRESERVED_COMMERCIAL_HISTORY",
  "UNRELATED_ACCOUNT_MEMBERSHIP",
  "LICENSE_ASSIGNMENT_REMAINS",
] as const;

export type AccountsCustomerRetentionBlocker =
  (typeof ACCOUNTS_CUSTOMER_RETENTION_BLOCKERS)[number];

export interface AccountsCustomerRetentionFacts {
  readonly userId: string;
  readonly administratorProtected: boolean;
  readonly organizationAccounts: number;
  readonly memberships: number;
  readonly licenseAssignments: number;
  readonly orders: number;
  readonly licenses: number;
  readonly subscriptions: number;
  readonly trials: number;
  readonly legalAcceptances: number;
  readonly activeSubscriptions: number;
  readonly unresolvedPayments: number;
  readonly legalHold: boolean;
  readonly retentionActive: boolean;
  readonly pseudonymized: boolean;
}

export interface AccountsCustomerRetentionReport {
  readonly userId: string;
  readonly blockers: readonly AccountsCustomerRetentionBlocker[];
  readonly canPseudonymize: boolean;
  readonly canMarkPurgeEligible: boolean;
  readonly canPurge: boolean;
}

export type AccountsCustomerRetentionPolicyResult =
  | { readonly status: "OK"; readonly value: AccountsCustomerRetentionReport }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" };

export interface AccountsCustomerRetentionPolicyCapability {
  evaluate(
    facts: AccountsCustomerRetentionFacts,
  ): AccountsCustomerRetentionPolicyResult;
}
