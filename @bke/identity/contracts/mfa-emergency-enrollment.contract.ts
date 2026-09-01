export const IDENTITY_MFA_EMERGENCY_ENROLLMENT_CAPABILITY_ID =
  "bke.identity.mfa-emergency-enrollment.v1" as const;

export interface IdentityMfaEmergencyEnrollmentInput {
  readonly sessionToken: string;
  readonly emergencyToken: string;
}

export interface IdentityMfaEmergencyEnrollmentAuditContext {
  readonly authorizationId: string;
  readonly ownerKeyVersion: number;
  readonly deploymentEnvironment: string;
}

export type IdentityMfaEmergencyEnrollmentResult =
  | {
      readonly status: "ENROLLED";
      readonly userId: string;
      readonly recoveryCodes: readonly string[];
      readonly replacementSessionToken: string;
      readonly auditContext: IdentityMfaEmergencyEnrollmentAuditContext;
    }
  | {
      readonly status: "INVALID";
      readonly code:
        | "INVALID_SESSION"
        | "RECENT_AUTH_REQUIRED"
        | "FORBIDDEN"
        | "INVALID_EMERGENCY_ENROLLMENT";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "SESSION_PROVIDER_UNAVAILABLE"
        | "TOKEN_PROVIDER_UNAVAILABLE"
        | "CODE_PROVIDER_UNAVAILABLE"
        | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityMfaEmergencyEnrollmentCapability {
  enroll(
    input: IdentityMfaEmergencyEnrollmentInput,
  ): Promise<IdentityMfaEmergencyEnrollmentResult>;
}
