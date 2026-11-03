import type { IdentityRecentAuthChallengeIssuanceCapability, IdentityRecentAuthChallengeIssueInput, IdentityRecentAuthChallengeIssueResult } from "../contracts/recent-auth-challenge.contract";
import type { IdentitySessionValidationCapability } from "../contracts/session-validation.contract";
import type { IdentityEmailMfaChallengeMaterialProvider } from "./email-mfa-challenge-material-provider";
import type { IdentityRecentAuthChallengeRepository } from "./recent-auth-challenge-repository";

const RECENT_AUTH_CHALLENGE_TTL_MS = 10 * 60_000;

export function createIdentityRecentAuthChallengeIssuanceCapability(
  repository: IdentityRecentAuthChallengeRepository,
  materialProvider: IdentityEmailMfaChallengeMaterialProvider,
  nowProvider: () => Date = () => new Date(),
  sessionValidation?: IdentitySessionValidationCapability,
): IdentityRecentAuthChallengeIssuanceCapability {
  return Object.freeze({
    async issue(input: IdentityRecentAuthChallengeIssueInput): Promise<IdentityRecentAuthChallengeIssueResult> {
      let userId: string;
      let sessionId: string | undefined;
      if ("sessionToken" in input) {
        if (typeof input.sessionToken !== "string" || !input.sessionToken.trim()) return { status: "FAILED", code: "INVALID_INPUT" };
        if (!sessionValidation) return { status: "FAILED", code: "SESSION_PROVIDER_UNAVAILABLE" };
        const validation = await sessionValidation.validate(input.sessionToken.trim());
        if (validation.status === "INVALID") return { status: "REJECTED", code: "FORBIDDEN" };
        if (validation.status === "FAILED") return { status: "FAILED", code: validation.code === "TOKEN_PROVIDER_UNAVAILABLE" ? "SESSION_PROVIDER_UNAVAILABLE" : "PERSISTENCE_UNAVAILABLE" };
        const { session, principal } = validation.context;
        if (!session.authenticationMethod.startsWith("GOOGLE_OIDC")) return { status: "REJECTED", code: "FORBIDDEN" };
        userId = principal.id;
        sessionId = session.id;
      } else {
        if (typeof input.userId !== "string" || !input.userId.trim()) return { status: "FAILED", code: "INVALID_INPUT" };
        userId = input.userId.trim();
      }

      let material;
      try { material = materialProvider.issue(); }
      catch { return { status: "FAILED", code: "MATERIAL_PROVIDER_UNAVAILABLE" }; }
      const expiresAt = new Date(nowProvider().getTime() + RECENT_AUTH_CHALLENGE_TTL_MS);
      try {
        const persisted = await repository.replacePendingRecentAuthChallenge({
          challengeId: material.challengeId, userId, ...(sessionId ? { sessionId } : {}),
          tokenHash: material.tokenHash, codeHash: material.codeHash, expiresAt,
        });
        if (persisted.status === "PRINCIPAL_NOT_FOUND") return { status: "REJECTED", code: "PRINCIPAL_NOT_FOUND" };
        if (persisted.status === "FORBIDDEN") return { status: "REJECTED", code: "FORBIDDEN" };
        return { status: "ISSUED", challenge: { challengeToken: material.token, expiresAt, delivery: {
          recipientEmail: persisted.recipientEmail, code: material.code, reference: material.reference,
        } } };
      } catch { return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" }; }
    },
  });
}