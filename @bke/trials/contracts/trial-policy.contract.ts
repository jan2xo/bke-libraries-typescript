export const TRIAL_POLICY_CAPABILITY_ID = "trials.policy.v1" as const;

export const TRIAL_SOURCES = ["SELF_SERVICE", "ADMIN"] as const;
export type TrialSource = typeof TRIAL_SOURCES[number];
export const TRIAL_CHANGE_ACTIONS = ["SET_GRACE", "REVOKE"] as const;
export type TrialChangeAction = typeof TRIAL_CHANGE_ACTIONS[number];

export type TrialGrantFacts = Readonly<{
  productId: string;
  editionId: string;
  productName: string;
  editionName: string;
  features: readonly string[];
  maxUsers: number;
  maxDevicesPerUser: number;
  updatePolicy: string;
}>;

export type TrialGrantPlan = Readonly<{
  source: TrialSource;
  selfServiceYear: number | null;
  trialDays: 7;
  graceDays: number;
  trialStartsAt: Date;
  trialEndsAt: Date;
  graceEndsAt: Date;
  order: Readonly<{
    status: "PAID";
    currency: "PHP";
    subtotalMinor: 0;
    taxMinor: 0;
    totalMinor: 0;
    billingType: "ONE_TIME";
    priceId: string;
    policyId: string;
    planName: "7-day trial";
  }>;
  entitlement: Readonly<{
    features: readonly string[];
    maxUsers: number;
    maxDevicesPerUser: number;
    updatePolicy: string;
    trialEndsAt: Date;
    graceEndsAt: Date;
  }>;
  license: Readonly<{
    status: "ACTIVE";
    maxSeats: number;
    maxDevicesPerSeat: number;
    expiresAt: Date;
    eventType: "TRIAL_ISSUED";
  }>;
  auditAction: "TRIAL_STARTED" | "TRIAL_GRANTED_BY_ADMIN";
}>;

export type TrialExistingState = Readonly<{
  revokedAt: Date | null;
  trialEndsAt: Date;
  graceEndsAt: Date;
}>;

export type TrialChangePlan =
  | Readonly<{
      action: "REVOKE";
      noop: boolean;
      deactivateDevices: boolean;
      licenseStatus: "REVOKED";
      licenseEventType: "TRIAL_REVOKED";
      auditAction: "TRIAL_REVOKED";
    }>
  | Readonly<{
      action: "SET_GRACE";
      noop: false;
      graceDays: number;
      graceEndsAt: Date;
      licenseStatus: "ACTIVE" | "EXPIRED";
      licenseExpiresAt: Date;
      licenseEventType: "TRIAL_GRACE_CHANGED";
      auditAction: "TRIAL_GRACE_CHANGED";
    }>;
