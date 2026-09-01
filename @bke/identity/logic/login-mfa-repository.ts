export type IdentityLoginMfaChallengePurpose = "LOGIN" | "ENROLLMENT" | "RECENT_AUTH";

export interface IdentityLoginMfaChallengeRecord {
  readonly id: string;
  readonly userId: string;
  readonly purpose: IdentityLoginMfaChallengePurpose;
  readonly codeHash: string | null;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly attemptCount: number;
  readonly userRole: "CUSTOMER" | "ADMIN";
}

export interface IdentityLoginMfaRecoveryCodeRecord {
  readonly id: string;
}

export type IdentityLoginMfaConsumeResult = "CONSUMED" | "CHALLENGE_REJECTED" | "RECOVERY_REJECTED";

export interface IdentityLoginMfaRepository {
  findChallengeByTokenHash(tokenHash: string): Promise<IdentityLoginMfaChallengeRecord | null>;
  findUnusedRecoveryCode(userId: string, codeHash: string): Promise<IdentityLoginMfaRecoveryCodeRecord | null>;
  incrementChallengeAttempt(challengeId: string): Promise<void>;
  consumeChallenge(
    challengeId: string,
    recoveryCodeId: string | null,
    consumedAt: Date,
  ): Promise<IdentityLoginMfaConsumeResult>;
}
