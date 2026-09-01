export type IdentityEmailVerificationCompletionPersistenceResult =
  | {
      readonly status: "VERIFIED";
      readonly userId: string;
      readonly email: string;
    }
  | { readonly status: "INVALID_TOKEN" };

export interface IdentityEmailVerificationCompletionRepository {
  completeVerification(
    tokenHash: string,
    completedAt: Date,
  ): Promise<IdentityEmailVerificationCompletionPersistenceResult>;
}
