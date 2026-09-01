import type {
  IdentityEmailVerificationCompletionCapability,
  IdentityEmailVerificationCompletionInput,
  IdentityEmailVerificationCompletionResult,
} from "../contracts/email-verification-completion.contract";
import type { IdentityEmailVerificationCompletionRepository } from "./email-verification-completion-repository";
import type { IdentityEmailVerificationTokenProvider } from "./email-verification-token-provider";

export function createIdentityEmailVerificationCompletionCapability(
  repository: IdentityEmailVerificationCompletionRepository,
  tokenProvider: IdentityEmailVerificationTokenProvider,
  clock: () => Date = () => new Date(),
): IdentityEmailVerificationCompletionCapability {
  return Object.freeze({
    async complete(
      input: IdentityEmailVerificationCompletionInput,
    ): Promise<IdentityEmailVerificationCompletionResult> {
      // Preserve V1 proof semantics: do not trim or otherwise normalize token bytes.
      if (!input.token) {
        return { status: "REJECTED", code: "INVALID_TOKEN" };
      }

      let tokenHash: string;
      try {
        tokenHash = tokenProvider.hash(input.token);
      } catch {
        return { status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" };
      }

      const completedAt = clock();
      try {
        const persisted = await repository.completeVerification(
          tokenHash,
          completedAt,
        );
        if (persisted.status === "INVALID_TOKEN") {
          return { status: "REJECTED", code: "INVALID_TOKEN" };
        }

        return {
          status: "VERIFIED",
          userId: persisted.userId,
          email: persisted.email,
          verifiedAt: completedAt,
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
