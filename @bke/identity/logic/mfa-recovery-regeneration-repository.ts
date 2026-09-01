export interface IdentityMfaRecoveryRegenerationCommitInput {
  readonly userId: string;
  readonly recoveryCodeHashes: readonly string[];
  readonly regeneratedAt: Date;
}

export interface IdentityMfaRecoveryRegenerationRepository {
  regenerate(
    input: IdentityMfaRecoveryRegenerationCommitInput,
  ): Promise<void>;
}
