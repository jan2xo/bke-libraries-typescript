export const IDENTITY_LOGIN_MFA_VERIFICATION_CAPABILITY_ID =
  "bke.identity.login-mfa-verification.v1" as const;

export type IdentityLoginMfaAuthenticationMethod =
  | "PASSWORD_EMAIL_OTP"
  | "PASSWORD_RECOVERY";

export interface IdentityLoginMfaVerificationInput {
  readonly challengeToken: string;
  readonly code: string;
}

export type IdentityLoginMfaInvalidCode =
  | "INVALID_CHALLENGE"
  | "INVALID_CODE";

export type IdentityLoginMfaVerificationFailureCode =
  | "TOKEN_PROVIDER_UNAVAILABLE"
  | "CODE_PROVIDER_UNAVAILABLE"
  | "PERSISTENCE_UNAVAILABLE";

export type IdentityLoginMfaVerificationResult =
  | {
      readonly status: "VERIFIED";
      readonly userId: string;
      readonly authenticationMethod: IdentityLoginMfaAuthenticationMethod;
    }
  | {
      readonly status: "INVALID";
      readonly code: IdentityLoginMfaInvalidCode;
    }
  | {
      readonly status: "FAILED";
      readonly code: IdentityLoginMfaVerificationFailureCode;
    };

export interface IdentityLoginMfaVerificationCapability {
  verify(
    input: IdentityLoginMfaVerificationInput,
  ): Promise<IdentityLoginMfaVerificationResult>;
}
