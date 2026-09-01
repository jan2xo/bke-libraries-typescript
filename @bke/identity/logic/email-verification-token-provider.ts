export interface IdentityEmailVerificationTokenMaterial {
  readonly tokenId: string;
  readonly token: string;
  readonly tokenHash: string;
}

export interface IdentityEmailVerificationTokenProvider {
  issue(): IdentityEmailVerificationTokenMaterial;
  hash(token: string): string;
}
