export const IDENTITY_MFA_ENROLLMENT_COMPLETION_CAPABILITY_ID =
  "bke.identity.mfa-enrollment-completion.v1" as const;

export interface IdentityMfaEnrollmentCompletionInput {
  readonly userId: string;
  readonly challengeToken: string;
  readonly code: string;
}

export type IdentityMfaEnrollmentVerificationMethod =
  | "EMAIL_OTP"
  | "RECOVERY_CODE";

export type IdentityMfaEnrollmentCompletionResult =
  | {
      readonly status: "COMPLETED";
      readonly userId: string;
      readonly verificationMethod: IdentityMfaEnrollmentVerificationMethod;
      readonly recoveryCodes: readonly string[];
    }
  | {
      readonly status: "INVALID";
      readonly code:
        | "INVALID_ENROLLMENT"
        | "INVALID_CHALLENGE"
        | "INVALID_CODE";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "TOKEN_PROVIDER_UNAVAILABLE"
        | "CODE_PROVIDER_UNAVAILABLE"
        | "RECOVERY_PROVIDER_UNAVAILABLE"
        | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityMfaEnrollmentCompletionCapability {
  complete(
    input: IdentityMfaEnrollmentCompletionInput,
  ): Promise<IdentityMfaEnrollmentCompletionResult>;
}
