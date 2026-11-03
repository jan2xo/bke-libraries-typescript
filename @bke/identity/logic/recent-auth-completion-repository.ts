import type { IdentityIssuedSession } from "../contracts/session.contract";

export interface IdentityRecentAuthPasswordRecord {
  readonly passwordHash: string;
}

export interface IdentityRecentAuthChallengeRecord {
  readonly id: string;
  readonly userId: string;
  readonly purpose: "LOGIN" | "ENROLLMENT" | "RECENT_AUTH";
  readonly codeHash: string | null;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly attemptCount: number;
  readonly sessionId: string | null;
  readonly primaryAuthenticationMethod: "PASSWORD" | "GOOGLE_OIDC";
}

export interface IdentityRecentAuthRecoveryCodeRecord {
  readonly id: string;
}

export interface IdentityRecentAuthPasswordOnlyCustomerCommitInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly completedAt: Date;
}

export interface IdentityRecentAuthMfaCommitInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly challengeId: string;
  readonly recoveryCodeId: string | null;
  readonly completedAt: Date;
  readonly authenticationMethod:
    | "PASSWORD_EMAIL_OTP"
    | "PASSWORD_RECOVERY"
    | "GOOGLE_OIDC_EMAIL_OTP"
    | "GOOGLE_OIDC_RECOVERY";
}

export type IdentityRecentAuthCommitResult =
  | { readonly status: "COMPLETED"; readonly session: IdentityIssuedSession }
  | { readonly status: "SESSION_REJECTED" }
  | { readonly status: "CHALLENGE_REJECTED" }
  | { readonly status: "RECOVERY_REJECTED" };

export interface IdentityRecentAuthCompletionRepository {
  findPasswordRecord(userId: string): Promise<IdentityRecentAuthPasswordRecord | null>;
  findRecentAuthChallenge(
    userId: string,
    tokenHash: string,
  ): Promise<IdentityRecentAuthChallengeRecord | null>;
  findUnusedRecoveryCode(
    userId: string,
    codeHash: string,
  ): Promise<IdentityRecentAuthRecoveryCodeRecord | null>;
  incrementChallengeAttempt(challengeId: string): Promise<void>;
  upgradePasswordOnlyCustomerSession(
    input: IdentityRecentAuthPasswordOnlyCustomerCommitInput,
  ): Promise<IdentityRecentAuthCommitResult>;
  completeMfaRecentAuth(
    input: IdentityRecentAuthMfaCommitInput,
  ): Promise<IdentityRecentAuthCommitResult>;
}
