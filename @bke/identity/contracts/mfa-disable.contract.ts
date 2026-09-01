export const IDENTITY_MFA_DISABLE_CAPABILITY_ID = "bke.identity.mfa-disable.v1";

export interface IdentityMfaDisableInput {
  readonly userId: string;
}

export type IdentityMfaDisableResult =
  | {
      readonly status: "DISABLED";
      readonly userId: string;
      readonly disabledAt: Date;
      readonly enrollmentRequired: true;
    }
  | {
      readonly status: "INVALID";
      readonly code: "INVALID_INPUT" | "NOT_FOUND" | "FORBIDDEN" | "MFA_NOT_ENABLED";
    }
  | {
      readonly status: "FAILED";
      readonly code: "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityMfaDisableCapability {
  disable(input: IdentityMfaDisableInput): Promise<IdentityMfaDisableResult>;
}
