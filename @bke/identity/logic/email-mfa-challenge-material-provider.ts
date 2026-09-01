export interface IdentityEmailMfaChallengeMaterial {
  readonly challengeId: string;
  readonly token: string;
  readonly tokenHash: string;
  readonly code: string;
  readonly codeHash: string;
  readonly reference: string;
}

export interface IdentityEmailMfaChallengeMaterialProvider {
  issue(): IdentityEmailMfaChallengeMaterial;
}
