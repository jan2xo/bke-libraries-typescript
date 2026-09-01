export interface IdentityMagicLoginPrincipal {
  readonly email: string;
}

export interface IdentityMagicLoginTokenRecord {
  readonly id: string;
  readonly identifier: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly replacedAt: Date;
}

export interface IdentityMagicLoginRequestRepository {
  findEligibleCustomerByEmail(email: string): Promise<IdentityMagicLoginPrincipal | null>;
  replacePendingToken(record: IdentityMagicLoginTokenRecord): Promise<void>;
}
