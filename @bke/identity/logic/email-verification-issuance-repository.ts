export interface IdentityEmailVerificationPrincipal {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: Date | null;
}

export interface IdentityEmailVerificationTokenRecord {
  readonly id: string;
  readonly identifier: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface IdentityEmailVerificationIssuanceRepository {
  findPrincipalById(userId: string): Promise<IdentityEmailVerificationPrincipal | null>;
  replacePendingToken(record: IdentityEmailVerificationTokenRecord): Promise<void>;
}
