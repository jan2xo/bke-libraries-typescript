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
}

export interface IdentityRecentAuthRecoveryCodeRecord {
  readonly id: string;
}

export interface IdentityRecentAuthCustomerCommitInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly completedAt: Date;
}

export interface IdentityRecentAuthAdminCommitInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly challengeId: string;
  readonly recoveryCodeId: string | null;
  readonly completedAt: Date;
}

export type IdentityRecentAuthCommitResult =
  | { readonly status: "COMPLETED"; readonly session: IdentityIssuedSession }
  | { readonly status: "SESSION_REJECTED" }
  | { readonly status: "CHALLENGE_REJECTED" }
  | { readonly status: "RECOVERY_REJECTED" };

export interface IdentityRecentAuthCompletionRepository {
  findPasswordRecord(
    userId: string,
  ): Promise<IdentityRecentAuthPasswordRecord | null>;

  findRecentAuthChallenge(
    userId: string,
    tokenHash: string,
  ): Promise<IdentityRecentAuthChallengeRecord | null>;

  findUnusedRecoveryCode(
    userId: string,
    codeHash: string,
  ): Promise<IdentityRecentAuthRecoveryCodeRecord | null>;

  incrementChallengeAttempt(challengeId: string): Promise<void>;

  upgradeCustomerSession(
    input: IdentityRecentAuthCustomerCommitInput,
  ): Promise<IdentityRecentAuthCommitResult>;

  completeAdminRecentAuth(
    input: IdentityRecentAuthAdminCommitInput,
  ): Promise<IdentityRecentAuthCommitResult>;
}
