export const IDENTITY_MFA_RECOVERY_REGENERATION_CAPABILITY_ID =
  "bke.identity.mfa-recovery-regeneration.v1" as const;

export interface IdentityMfaRecoveryRegenerationInput {
  readonly sessionToken: string;
}

export type IdentityMfaRecoveryRegenerationResult =
  | {
      readonly status: "REGENERATED";
      readonly userId: string;
      readonly recoveryCodes: readonly string[];
      readonly replacementAuthenticationMethod: "PASSWORD_EMAIL_OTP";
    }
  | {
      readonly status: "INVALID";
      readonly code: "INVALID_SESSION" | "RECENT_AUTH_REQUIRED" | "FORBIDDEN";
    }
  | {
      readonly status: "FAILED";
      readonly code:
        | "SESSION_PROVIDER_UNAVAILABLE"
        | "CODE_PROVIDER_UNAVAILABLE"
        | "PERSISTENCE_UNAVAILABLE";
    };

export interface IdentityMfaRecoveryRegenerationCapability {
  regenerate(
    input: IdentityMfaRecoveryRegenerationInput,
  ): Promise<IdentityMfaRecoveryRegenerationResult>;
}
