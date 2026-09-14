export const PRIVACY_CUSTOMER_MINIMIZATION_CAPABILITY_ID =
  "bke.privacy.customer-minimization.v1" as const;

export interface PrivacyCustomerMinimizationInput {
  readonly userId: string;
  readonly email: string;
  readonly now: Date;
}

export interface PrivacyCustomerMinimizationPlan {
  readonly pseudonymousEmail: string;
  readonly normalizedEmailHashSource: string;
  readonly emailOutboxUpdate: Readonly<{
    recipient: string;
    payload: Readonly<{ redacted: true; reason: "PRIVACY_MINIMIZATION" }>;
  }>;
  readonly userUpdate: Readonly<{
    email: string;
    name: null;
    emailVerified: null;
    lifecycleState: "PSEUDONYMIZED";
    pseudonymizedAt: Date;
    suspendedAt: Date;
  }>;
  readonly customerAccountUpdate: Readonly<{
    displayName: "Former customer";
    billingEmail: string;
    taxId: null;
    lifecycleState: "PSEUDONYMIZED";
    pseudonymizedAt: Date;
  }>;
  readonly audit: Readonly<{
    action: "CUSTOMER_PERSONAL_DATA_PSEUDONYMIZED";
    targetType: "User";
    metadata: Readonly<{ preservedHistory: true; emailHashRetained: true }>;
  }>;
}
