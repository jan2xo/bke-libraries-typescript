export interface IdentityLoginMfaChallengePersistenceInput {
  readonly challengeId: string;
  readonly userId: string;
  readonly primaryAuthenticationMethod: "PASSWORD" | "GOOGLE_OIDC";
  readonly tokenHash: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
}

export type IdentityLoginMfaChallengePersistenceResult =
  | { readonly status: "CREATED"; readonly recipientEmail: string }
  | { readonly status: "PRINCIPAL_NOT_FOUND" }
  | { readonly status: "FORBIDDEN" };

export interface IdentityLoginMfaChallengeRepository {
  replacePendingLoginChallenge(
    input: IdentityLoginMfaChallengePersistenceInput,
  ): Promise<IdentityLoginMfaChallengePersistenceResult>;
}
