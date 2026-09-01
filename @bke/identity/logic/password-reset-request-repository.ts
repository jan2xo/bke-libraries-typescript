export interface IdentityPasswordResetPrincipal {
  readonly id: string;
  readonly email: string;
}

export interface IdentityPasswordResetTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface IdentityPasswordResetRequestRepository {
  findPrincipalByEmail(email: string): Promise<IdentityPasswordResetPrincipal | null>;
  createToken(record: IdentityPasswordResetTokenRecord): Promise<void>;
}
