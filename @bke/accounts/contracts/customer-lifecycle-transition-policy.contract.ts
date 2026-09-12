import type { AccountsLifecycleState } from "./account.contract";

export const ACCOUNTS_CUSTOMER_LIFECYCLE_TRANSITION_POLICY_CAPABILITY_ID =
  "bke.accounts.customer-lifecycle-transition-policy.v1" as const;

export type AccountsCustomerLifecyclePolicyErrorCode =
  | "FORBIDDEN"
  | "CUSTOMER_CLOSURE_BLOCKED"
  | "CUSTOMER_ALREADY_CLOSED"
  | "PRIVACY_DELETION_BLOCKED"
  | "LEGAL_HOLD_ACTIVE"
  | "RETENTION_PERIOD_ACTIVE"
  | "PURGE_NOT_ELIGIBLE"
  | "PURGE_CONFIRMATION_REQUIRED";

export type AccountsCustomerLifecyclePolicyResult<T = undefined> =
  | { readonly status: "OK"; readonly value: T }
  | {
      readonly status: "FAILED";
      readonly code: AccountsCustomerLifecyclePolicyErrorCode;
      readonly blockers?: readonly string[];
    };

export interface AccountsCloseCustomerPolicyInput {
  readonly userId: string;
  readonly actorId: string;
  readonly administratorProtected: boolean;
  readonly lifecycleState: AccountsLifecycleState;
  readonly organizationAccounts: number;
}

export interface AccountsReopenCustomerPolicyInput {
  readonly administratorProtected: boolean;
  readonly lifecycleState: AccountsLifecycleState;
  readonly pseudonymized: boolean;
  readonly legalHold: boolean;
}

export interface AccountsPrivacyDeletionRequestPolicyInput {
  readonly administratorProtected: boolean;
  readonly legalHold: boolean;
  readonly retentionExpiresAt: Date;
  readonly now: Date;
}

export interface AccountsLegalHoldPolicyInput {
  readonly administratorProtected: boolean;
  readonly enabled: boolean;
  readonly reason?: string;
  readonly now: Date;
}

export interface AccountsPseudonymizeCustomerPolicyInput {
  readonly lifecycleState: AccountsLifecycleState;
  readonly canPseudonymize: boolean;
  readonly blockers: readonly string[];
}

export interface AccountsMarkPurgeEligiblePolicyInput {
  readonly canMarkPurgeEligible: boolean;
  readonly blockers: readonly string[];
}

export interface AccountsFinalPurgePolicyInput {
  readonly userId: string;
  readonly confirmation: string;
  readonly lifecycleState: AccountsLifecycleState;
  readonly canPurge: boolean;
  readonly blockers: readonly string[];
}

export interface AccountsCustomerLifecycleTransitionPolicyCapability {
  close(input: AccountsCloseCustomerPolicyInput): AccountsCustomerLifecyclePolicyResult;
  reopen(input: AccountsReopenCustomerPolicyInput): AccountsCustomerLifecyclePolicyResult;
  requestPrivacyDeletion(
    input: AccountsPrivacyDeletionRequestPolicyInput,
  ): AccountsCustomerLifecyclePolicyResult;
  legalHold(input: AccountsLegalHoldPolicyInput): AccountsCustomerLifecyclePolicyResult<{
    readonly legalHoldAt: Date | null;
    readonly legalHoldReason: string | null;
  }>;
  pseudonymize(
    input: AccountsPseudonymizeCustomerPolicyInput,
  ): AccountsCustomerLifecyclePolicyResult;
  markPurgeEligible(
    input: AccountsMarkPurgeEligiblePolicyInput,
  ): AccountsCustomerLifecyclePolicyResult;
  finalPurge(input: AccountsFinalPurgePolicyInput): AccountsCustomerLifecyclePolicyResult;
}
