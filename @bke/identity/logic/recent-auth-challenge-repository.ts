export interface IdentityRecentAuthChallengePersistenceInput {
  readonly challengeId: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
}

export type IdentityRecentAuthChallengePersistenceResult =
  | { readonly status: "CREATED"; readonly recipientEmail: string }
  | { readonly status: "PRINCIPAL_NOT_FOUND" }
  | { readonly status: "FORBIDDEN" };

export interface IdentityRecentAuthChallengeRepository {
  replacePendingRecentAuthChallenge(
    input: IdentityRecentAuthChallengePersistenceInput,
  ): Promise<IdentityRecentAuthChallengePersistenceResult>;
}
