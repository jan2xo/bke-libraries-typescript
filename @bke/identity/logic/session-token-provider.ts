export interface IdentitySessionTokenMaterial {
  readonly sessionId: string;
  readonly token: string;
  readonly tokenHash: string;
}

export interface IdentitySessionTokenProvider {
  issue(): IdentitySessionTokenMaterial;
  hash(token: string): string;
}
