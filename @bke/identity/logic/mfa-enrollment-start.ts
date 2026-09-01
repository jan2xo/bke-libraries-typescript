import type {
  IdentityMfaEnrollmentStartCapability,
  IdentityMfaEnrollmentStartInput,
  IdentityMfaEnrollmentStartOutcome,
} from "../contracts/mfa-enrollment-start.contract";
import type { IdentityEmailMfaChallengeMaterialProvider } from "./email-mfa-challenge-material-provider";
import type { IdentityMfaEnrollmentStartRepository } from "./mfa-enrollment-start-repository";

const ENROLLMENT_TTL_MS = 10 * 60_000;

export function createIdentityMfaEnrollmentStartCapability(
  repository: IdentityMfaEnrollmentStartRepository,
  materialProvider: IdentityEmailMfaChallengeMaterialProvider,
  nowProvider: () => Date = () => new Date(),
): IdentityMfaEnrollmentStartCapability {
  return Object.freeze({
    async start(
      input: IdentityMfaEnrollmentStartInput,
    ): Promise<IdentityMfaEnrollmentStartOutcome> {
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

      const now = nowProvider();
      const expiresAt = new Date(now.getTime() + ENROLLMENT_TTL_MS);

      try {
        const persisted = await repository.startEnrollment({
          userId,
          challengeId: material.challengeId,
          tokenHash: material.tokenHash,
          codeHash: material.codeHash,
          pendingExpiresAt: expiresAt,
          updatedAt: now,
        });

        if (persisted.status !== "STARTED") {
          return { status: "REJECTED", code: persisted.status };
        }

        return {
          status: "STARTED",
          challengeToken: material.token,
          expiresAt,
          delivery: {
            recipientEmail: persisted.recipientEmail,
            code: material.code,
            reference: material.reference,
          },
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
