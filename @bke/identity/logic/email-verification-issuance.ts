import type {
  IdentityEmailVerificationIssuanceCapability,
  IdentityEmailVerificationIssuanceInput,
  IdentityEmailVerificationIssuanceResult,
} from "../contracts/email-verification-issuance.contract";
import type { IdentityEmailVerificationIssuanceRepository } from "./email-verification-issuance-repository";
import type { IdentityEmailVerificationTokenProvider } from "./email-verification-token-provider";

const TOKEN_TTL_MS = 30 * 60 * 1000;

export function createIdentityEmailVerificationIssuanceCapability(
  repository: IdentityEmailVerificationIssuanceRepository,
  tokenProvider: IdentityEmailVerificationTokenProvider,
  clock: () => Date = () => new Date(),
): IdentityEmailVerificationIssuanceCapability {
  return Object.freeze({
    async issue(
      input: IdentityEmailVerificationIssuanceInput,
    ): Promise<IdentityEmailVerificationIssuanceResult> {
      const userId = input.userId.trim();
      if (!userId) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let principal;
      try {
        principal = await repository.findPrincipalById(userId);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (!principal) {
        return { status: "REJECTED", code: "PRINCIPAL_NOT_FOUND" };
      }

      if (principal.emailVerified) {
        return {
          status: "ALREADY_VERIFIED",
          userId: principal.id,
          email: principal.email,
        };
      }

      let material;
      try {
        material = tokenProvider.issue();
      } catch {
        return { status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" };
      }

      const issuedAt = clock();
      try {
        await repository.replacePendingToken({
          id: material.tokenId,
          identifier: principal.email,
          tokenHash: material.tokenHash,
          expiresAt: new Date(issuedAt.getTime() + TOKEN_TTL_MS),
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      return {
        status: "ISSUED",
        userId: principal.id,
        delivery: {
          recipientEmail: principal.email,
          token: material.token,
        },
      };
    },
  });
}
