export interface IdentityMagicLoginTokenMaterial {
  readonly tokenId: string;
  readonly token: string;
  readonly tokenHash: string;
}

export interface IdentityMagicLoginTokenProvider {
  issue(): IdentityMagicLoginTokenMaterial;
  hash(token: string): string;
}
