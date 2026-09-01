export interface IdentityPasswordResetTokenMaterial {
  readonly tokenId: string;
  readonly token: string;
  readonly tokenHash: string;
}

export interface IdentityPasswordResetTokenProvider {
  issue(): IdentityPasswordResetTokenMaterial;
  hash(token: string): string;
}
