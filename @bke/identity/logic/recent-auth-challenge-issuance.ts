import type {
  IdentityRecentAuthChallengeIssuanceCapability,
  IdentityRecentAuthChallengeIssueInput,
  IdentityRecentAuthChallengeIssueResult,
} from "../contracts/recent-auth-challenge.contract";
import type { IdentityEmailMfaChallengeMaterialProvider } from "./email-mfa-challenge-material-provider";
import type { IdentityRecentAuthChallengeRepository } from "./recent-auth-challenge-repository";

const RECENT_AUTH_CHALLENGE_TTL_MS = 10 * 60_000;

export function createIdentityRecentAuthChallengeIssuanceCapability(
  repository: IdentityRecentAuthChallengeRepository,
  materialProvider: IdentityEmailMfaChallengeMaterialProvider,
  nowProvider: () => Date = () => new Date(),
): IdentityRecentAuthChallengeIssuanceCapability {
  return Object.freeze({
    async issue(
      input: IdentityRecentAuthChallengeIssueInput,
    ): Promise<IdentityRecentAuthChallengeIssueResult> {
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

      const expiresAt = new Date(
        nowProvider().getTime() + RECENT_AUTH_CHALLENGE_TTL_MS,
      );

      try {
        const persisted = await repository.replacePendingRecentAuthChallenge({
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
