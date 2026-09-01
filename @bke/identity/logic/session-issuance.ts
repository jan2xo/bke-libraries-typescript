import type {
  IdentitySessionAssuranceLevel,
  IdentitySessionAuthenticationMethod,
  IdentitySessionIssuanceCapability,
  IdentitySessionIssueInput,
  IdentitySessionIssueResult,
} from "../contracts/session.contract";
import type { IdentitySessionRepository } from "./session-repository";
import type { IdentitySessionTokenProvider } from "./session-token-provider";

const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

type SessionAssurance = {
  readonly mfaVerifiedAt: Date | null;
  readonly recentAuthenticatedAt: Date | null;
  readonly assuranceLevel: IdentitySessionAssuranceLevel;
};

function assuranceFor(
  method: IdentitySessionAuthenticationMethod,
  now: Date,
): SessionAssurance {
  switch (method) {
    case "MAGIC_LINK":
      return {
        mfaVerifiedAt: null,
        recentAuthenticatedAt: null,
        assuranceLevel: "BASIC",
      };
    case "PASSWORD":
    case "MFA_ENROLLMENT":
      return {
        mfaVerifiedAt: null,
        recentAuthenticatedAt: now,
        assuranceLevel: "RECENTLY_AUTHENTICATED",
      };
    case "PASSWORD_TOTP":
    case "PASSWORD_EMAIL_OTP":
    case "PASSWORD_RECOVERY":
      return {
        mfaVerifiedAt: now,
        recentAuthenticatedAt: now,
        assuranceLevel: "RECENTLY_AUTHENTICATED",
      };
  }
}

export function createIdentitySessionIssuanceCapability(
  repository: IdentitySessionRepository,
  tokenProvider: IdentitySessionTokenProvider,
  clock: () => Date = () => new Date(),
): IdentitySessionIssuanceCapability {
  return Object.freeze({
    async issue(input: IdentitySessionIssueInput): Promise<IdentitySessionIssueResult> {
      const userId = input.userId.trim();
      if (!userId) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let tokenMaterial;
      try {
        tokenMaterial = tokenProvider.issue();
      } catch {
        return { status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" };
      }

      const now = clock();
      const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
      const assurance = assuranceFor(input.authenticationMethod, now);

      try {
        const persisted = await repository.issueSession({
          id: tokenMaterial.sessionId,
          tokenHash: tokenMaterial.tokenHash,
          userId,
          expiresAt,
          lastAuthenticatedAt: now,
          mfaVerifiedAt: assurance.mfaVerifiedAt,
          recentAuthenticatedAt: assurance.recentAuthenticatedAt,
          lastSeenAt: now,
          absoluteExpiresAt: expiresAt,
          userAgentSummary: input.userAgentSummary ?? null,
          networkHint: input.networkHint ?? null,
          authenticationMethod: input.authenticationMethod,
          assuranceLevel: assurance.assuranceLevel,
        });

        if (persisted.status === "PRINCIPAL_NOT_FOUND") {
          return { status: "REJECTED", code: "PRINCIPAL_NOT_FOUND" };
        }
        if (persisted.status === "ACCOUNT_NOT_ACTIVE") {
          return { status: "REJECTED", code: "ACCOUNT_NOT_ACTIVE" };
        }

        return {
          status: "ISSUED",
          token: tokenMaterial.token,
          session: persisted.session,
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
