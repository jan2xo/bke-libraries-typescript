import type {
  IdentityLoginMfaChallengeIssuanceCapability,
  IdentityLoginMfaChallengeIssueInput,
  IdentityLoginMfaChallengeIssueResult,
} from "../contracts/login-mfa-challenge.contract";
import type { IdentityLoginMfaChallengeMaterialProvider } from "./login-mfa-challenge-material-provider";
import type { IdentityLoginMfaChallengeRepository } from "./login-mfa-challenge-repository";

const LOGIN_CHALLENGE_TTL_MS = 10 * 60_000;

export function createIdentityLoginMfaChallengeIssuanceCapability(
  repository: IdentityLoginMfaChallengeRepository,
  materialProvider: IdentityLoginMfaChallengeMaterialProvider,
  nowProvider: () => Date = () => new Date(),
): IdentityLoginMfaChallengeIssuanceCapability {
  return Object.freeze({
    async issue(
      input: IdentityLoginMfaChallengeIssueInput,
    ): Promise<IdentityLoginMfaChallengeIssueResult> {
      const userId = input.userId.trim();
      if (!userId) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let material;
      try {
        material = materialProvider.issue();
      } catch {
        return { status: "FAILED", code: "MATERIAL_PROVIDER_UNAVAILABLE" };
      }

      const expiresAt = new Date(nowProvider().getTime() + LOGIN_CHALLENGE_TTL_MS);

      try {
        const persisted = await repository.replacePendingLoginChallenge({
          challengeId: material.challengeId,
          userId,
          tokenHash: material.tokenHash,
          codeHash: material.codeHash,
          expiresAt,
        });

        if (persisted.status === "PRINCIPAL_NOT_FOUND") {
          return { status: "REJECTED", code: "PRINCIPAL_NOT_FOUND" };
        }
        if (persisted.status === "FORBIDDEN") {
          return { status: "REJECTED", code: "FORBIDDEN" };
        }

        return {
          status: "ISSUED",
          challenge: {
            challengeToken: material.token,
            expiresAt,
            delivery: {
              recipientEmail: persisted.recipientEmail,
              code: material.code,
              reference: material.reference,
            },
          },
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
