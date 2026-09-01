export const IDENTITY_MFA_ENROLLMENT_START_CAPABILITY_ID =
  "bke.identity.mfa-enrollment-start.v1" as const;

export interface IdentityMfaEnrollmentStartInput {
  readonly userId: string;
}

export interface IdentityMfaEnrollmentStartResult {
  readonly status: "STARTED";
  readonly challengeToken: string;
  readonly expiresAt: Date;
  readonly delivery: {
    readonly recipientEmail: string;
    readonly code: string;
    readonly reference: string;
  };
}

export type IdentityMfaEnrollmentStartOutcome =
  | IdentityMfaEnrollmentStartResult
  | {
      readonly status: "REJECTED";
      readonly code:
        | "PRINCIPAL_NOT_FOUND"
        | "FORBIDDEN"
        | "MFA_ALREADY_ENABLED";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "INVALID_INPUT"
        | "MATERIAL_PROVIDER_UNAVAILABLE"
        | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityMfaEnrollmentStartCapability {
  start(
    input: IdentityMfaEnrollmentStartInput,
  ): Promise<IdentityMfaEnrollmentStartOutcome>;
}
