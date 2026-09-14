export const LICENSING_TRIAL_STATE_POLICY_CAPABILITY_ID =
  "bke.licensing.trial-state-policy.v1" as const;

export const LICENSING_TRIAL_TERM_DAYS = 7 as const;
export const LICENSING_TRIAL_MAX_GRACE_DAYS = 14 as const;

export type LicensingTrialSource = "SELF_SERVICE" | "ADMIN";
export type LicensingTrialChangeAction = "SET_GRACE" | "REVOKE";
export type LicensingTrialLicenseStatus = "ACTIVE" | "EXPIRED" | "REVOKED";
export type LicensingTrialEventType =
  | "TRIAL_ISSUED"
  | "TRIAL_GRACE_CHANGED"
  | "TRIAL_REVOKED";

export interface LicensingTrialWindow {
  readonly startsAt: Date;
  readonly trialEndsAt: Date;
  readonly graceEndsAt: Date;
  readonly graceDays: number;
}

export type LicensingTrialPolicyResult<T> =
  | { readonly status: "OK"; readonly value: T }
  | {
      readonly status: "FAILED";
      readonly code: "INVALID_GRACE_PERIOD" | "TRIAL_REVOKED";
    };

export interface LicensingTrialStatePolicyCapability {
  createWindow(input: {
    readonly startsAt: Date;
    readonly graceDays?: number;
  }): LicensingTrialPolicyResult<LicensingTrialWindow>;

  changeGrace(input: {
    readonly trialEndsAt: Date;
    readonly graceDays: number;
    readonly revokedAt?: Date | null;
    readonly now: Date;
  }): LicensingTrialPolicyResult<{
    readonly graceEndsAt: Date;
    readonly licenseStatus: Exclude<LicensingTrialLicenseStatus, "REVOKED">;
    readonly eventType: "TRIAL_GRACE_CHANGED";
  }>;

  revoke(input: {
    readonly revokedAt?: Date | null;
    readonly now: Date;
  }): LicensingTrialPolicyResult<{
    readonly revokedAt: Date;
    readonly licenseStatus: "REVOKED";
    readonly eventType: "TRIAL_REVOKED";
    readonly alreadyRevoked: boolean;
  }>;
}
