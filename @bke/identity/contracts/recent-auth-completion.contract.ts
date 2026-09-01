import type { IdentityIssuedSession } from "./session.contract";

export const IDENTITY_RECENT_AUTH_COMPLETION_CAPABILITY_ID =
  "bke.identity.recent-auth-completion.v1" as const;

export interface IdentityRecentAuthCompletionInput {
  readonly sessionToken: string;
  readonly password: string;
  readonly challengeToken?: string;
  readonly code?: string;
}

export type IdentityRecentAuthVerificationMethod =
  | "PASSWORD"
  | "PASSWORD_EMAIL_OTP"
  | "PASSWORD_RECOVERY";

export type IdentityRecentAuthInvalidCode =
  | "INVALID_SESSION"
  | "INVALID_CREDENTIALS"
  | "INVALID_CHALLENGE"
  | "INVALID_CODE"
  | "MFA_REQUIRED";

export type IdentityRecentAuthFailureCode =
  | "INVALID_INPUT"
  | "SESSION_PROVIDER_UNAVAILABLE"
  | "PASSWORD_PROVIDER_UNAVAILABLE"
  | "CODE_PROVIDER_UNAVAILABLE"
  | "PERSISTENCE_UNAVAILABLE";

export type IdentityRecentAuthCompletionResult =
  | {
      readonly status: "COMPLETED";
      readonly session: IdentityIssuedSession;
      readonly verificationMethod: IdentityRecentAuthVerificationMethod;
    }
  | {
      readonly status: "INVALID";
      readonly code: IdentityRecentAuthInvalidCode;
    }
  | {
      readonly status: "FAILED";
      readonly code: IdentityRecentAuthFailureCode;
    };

export interface IdentityRecentAuthCompletionCapability {
  complete(
    input: IdentityRecentAuthCompletionInput,
  ): Promise<IdentityRecentAuthCompletionResult>;
}
