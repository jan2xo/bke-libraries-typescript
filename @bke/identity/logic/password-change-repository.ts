export interface IdentityPasswordChangeCredential {
  readonly passwordHash: string;
}

export interface IdentityPasswordChangeCommitInput {
  readonly userId: string;
  readonly passwordHash: string;
  readonly changedAt: Date;
}

export interface IdentityPasswordChangeRepository {
  findCredentialByUserId(
    userId: string,
  ): Promise<IdentityPasswordChangeCredential | null>;
  changePassword(input: IdentityPasswordChangeCommitInput): Promise<void>;
}
