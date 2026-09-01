export type AccountsAccountType = "INDIVIDUAL" | "ORGANIZATION";

export type AccountsMemberRole =
  | "OWNER"
  | "BILLING"
  | "LICENSE_MANAGER"
  | "MEMBER";

export type AccountsLifecycleState =
  | "ACTIVE"
  | "SUSPENDED"
  | "CLOSURE_REQUESTED"
  | "CLOSED"
  | "PRIVACY_REVIEW"
  | "PSEUDONYMIZED"
  | "PURGE_ELIGIBLE";

export type AccountsInvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REVOKED"
  | "EXPIRED";

export interface AccountsAccountSnapshot {
  readonly id: string;
  readonly type: AccountsAccountType;
  readonly displayName: string;
  readonly ownerId: string;
  readonly billingEmail: string;
  readonly taxId: string | null;
  readonly lifecycleState: AccountsLifecycleState;
}
