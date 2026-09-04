import type {
  IdentityLoginMfaChallengeReissueCapability,
  IdentityLoginMfaChallengeReissueInput,
  IdentityLoginMfaChallengeReissueResult,
} from "../contracts/login-mfa-challenge-reissue.contract";
import type { IdentityLoginMfaChallengeIssuanceCapability } from "../contracts/login-mfa-challenge.contract";
import type { IdentityLoginMfaProofProvider } from "./login-mfa-proof-provider";
import type { IdentityLoginMfaRepository } from "./login-mfa-repository";

const MAX_ATTEMPTS = 5;

export function createIdentityLoginMfaChallengeReissueCapability(
  repository: IdentityLoginMfaRepository,
  proofProvider: IdentityLoginMfaProofProvider,
  issuance: IdentityLoginMfaChallengeIssuanceCapability,
  clock: () => Date = () => new Date(),
): IdentityLoginMfaChallengeReissueCapability {
  return Object.freeze({
    async reissue(
      input: IdentityLoginMfaChallengeReissueInput,
    ): Promise<IdentityLoginMfaChallengeReissueResult> {
      if (!input.challengeToken) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let tokenHash: string;
      try {
        tokenHash = proofProvider.hashChallengeToken(input.challengeToken);
      } catch {
        return { status: "FAILED", code: "PROOF_PROVIDER_UNAVAILABLE" };
      }

      let pending;
      try {
        pending = await repository.findChallengeByTokenHash(tokenHash);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      const now = clock();
      if (
        !pending ||
        pending.purpose !== "LOGIN" ||
        pending.consumedAt !== null ||
        pending.expiresAt <= now ||
        pending.attemptCount >= MAX_ATTEMPTS ||
        pending.userRole !== "ADMIN"
      ) {
        return { status: "REJECTED", code: "INVALID_MFA_CHALLENGE" };
      }

      const issued = await issuance.issue({ userId: pending.userId });
      if (issued.status === "ISSUED") {
        return issued;
      }
      if (issued.status === "REJECTED") {
        return { status: "REJECTED", code: issued.code };
      }
      return { status: "FAILED", code: issued.code };
    },
  });
}
