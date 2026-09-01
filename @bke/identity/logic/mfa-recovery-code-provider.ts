export interface IdentityMfaRecoveryCodeMaterial {
  readonly value: string;
  readonly hash: string;
}

export interface IdentityMfaRecoveryCodeProvider {
  issue(count?: number): readonly IdentityMfaRecoveryCodeMaterial[];
}
