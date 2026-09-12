export const ACCOUNTS_PRIVACY_REQUEST_MANAGEMENT_CAPABILITY_ID =
  "bke.accounts.privacy-request-management.v1" as const;

export const ACCOUNTS_PRIVACY_REQUEST_TYPES = [
  "ACCESS",
  "CORRECTION",
  "EXPORT",
  "DELETION",
  "RESTRICTION",
  "OBJECTION",
  "BREACH_REPORT",
] as const;

export type AccountsPrivacyRequestType =
  (typeof ACCOUNTS_PRIVACY_REQUEST_TYPES)[number];

export const ACCOUNTS_PRIVACY_REQUEST_STATUSES = [
  "OPEN",
  "IN_REVIEW",
  "FULFILLED",
  "REJECTED",
  "CANCELLED",
] as const;

export type AccountsPrivacyRequestStatus =
  (typeof ACCOUNTS_PRIVACY_REQUEST_STATUSES)[number];

export interface AccountsPrivacyRequestSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly customerAccountId: string | null;
  readonly requestType: AccountsPrivacyRequestType;
  readonly status: AccountsPrivacyRequestStatus;
  readonly summary: string;
  readonly responseSummary: string | null;
  readonly reviewedById: string | null;
  readonly reviewedAt: Date | null;
  readonly closedAt: Date | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export interface AccountsCreatePrivacyRequestInput {
  readonly userId: string;
  readonly customerAccountId?: string | null;
  readonly requestType: AccountsPrivacyRequestType;
  readonly summary: string;
  readonly ipAddress: string;
  readonly userAgent?: string | null;
}

export interface AccountsTransitionPrivacyRequestInput {
  readonly actorId: string;
  readonly requestId: string;
  readonly status: Exclude<AccountsPrivacyRequestStatus, "OPEN">;
  readonly responseSummary: string;
}

export type AccountsPrivacyRequestManagementResult =
  | { readonly status: "OK"; readonly value: AccountsPrivacyRequestSnapshot }
  | { readonly status: "NOT_FOUND" }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_PRIVACY_REQUEST_TYPE"
        | "PRIVACY_REQUEST_CLOSED"
        | "PRIVACY_RESPONSE_REQUIRED"
        | "INVALID_INPUT"
        | "PERSISTENCE_UNAVAILABLE";
    };

export interface AccountsPrivacyRequestManagementCapability {
  create(
    input: AccountsCreatePrivacyRequestInput,
  ): Promise<AccountsPrivacyRequestManagementResult>;
  transition(
    input: AccountsTransitionPrivacyRequestInput,
  ): Promise<AccountsPrivacyRequestManagementResult>;
}
