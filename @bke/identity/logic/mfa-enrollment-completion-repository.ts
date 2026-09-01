export interface IdentityMfaEnrollmentChallengeRecord {
  readonly id: string;
  readonly userId: string;
  readonly purpose: "LOGIN" | "ENROLLMENT" | "RECENT_AUTH";
  readonly codeHash: string | null;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly attemptCount: number;
  readonly userRole: "CUSTOMER" | "ADMIN";
  readonly mfaMethodId: string | null;
  readonly mfaEnabledAt: Date | null;
  readonly pendingExpiresAt: Date | null;
}

export interface IdentityMfaEnrollmentRecoveryCodeRecord {
  readonly id: string;
}

export type IdentityMfaEnrollmentCommitResult =
  | "COMPLETED"
  | "CHALLENGE_REJECTED"
  | "RECOVERY_REJECTED"
  | "ENROLLMENT_REJECTED";

export interface IdentityMfaEnrollmentCompletionCommitInput {
  readonly userId: string;
  readonly challengeId: string;
  readonly recoveryCodeId: string | null;
  readonly newRecoveryCodeHashes: readonly string[];
  readonly completedAt: Date;
}

export interface IdentityMfaEnrollmentCompletionRepository {
  findEnrollmentChallenge(
    userId: string,
    tokenHash: string,
  ): Promise<IdentityMfaEnrollmentChallengeRecord | null>;

  findUnusedRecoveryCode(
    userId: string,
    codeHash: string,
  ): Promise<IdentityMfaEnrollmentRecoveryCodeRecord | null>;

  incrementChallengeAttempt(challengeId: string): Promise<void>;

  completeEnrollment(
    input: IdentityMfaEnrollmentCompletionCommitInput,
  ): Promise<IdentityMfaEnrollmentCommitResult>;
}
