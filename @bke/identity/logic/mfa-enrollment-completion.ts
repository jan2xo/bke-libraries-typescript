import type {
  IdentityMfaEnrollmentCompletionCapability,
  IdentityMfaEnrollmentCompletionInput,
  IdentityMfaEnrollmentCompletionResult,
} from "../contracts/mfa-enrollment-completion.contract";
import type { IdentityEmailMfaProofProvider } from "./email-mfa-proof-provider";
import type { IdentityMfaEnrollmentCompletionRepository } from "./mfa-enrollment-completion-repository";
import type { IdentityMfaRecoveryCodeProvider } from "./mfa-recovery-code-provider";

export function createIdentityMfaEnrollmentCompletionCapability(
  repository: IdentityMfaEnrollmentCompletionRepository,
  proofProvider: IdentityEmailMfaProofProvider,
  recoveryCodeProvider: IdentityMfaRecoveryCodeProvider,
  clock: () => Date = () => new Date(),
): IdentityMfaEnrollmentCompletionCapability {
  return Object.freeze({
    async complete(
      input: IdentityMfaEnrollmentCompletionInput,
    ): Promise<IdentityMfaEnrollmentCompletionResult> {
      const userId = input.userId.trim();
      const challengeToken = input.challengeToken.trim();
      const code = input.code.trim();

      if (!userId || !challengeToken) {
        return { status: "INVALID", code: "INVALID_CHALLENGE" };
      }
      if (code.length < 6 || code.length > 32) {
        return { status: "INVALID", code: "INVALID_CODE" };
      }

      let tokenHash: string;
      try {
        tokenHash = proofProvider.hashChallengeToken(challengeToken);
      } catch {
        return { status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" };
      }

      let challenge;
      try {
        challenge = await repository.findEnrollmentChallenge(userId, tokenHash);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      const now = clock();
      if (
        !challenge ||
        challenge.purpose !== "ENROLLMENT" ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.attemptCount >= 5 ||
        challenge.userRole !== "ADMIN"
      ) {
        return { status: "INVALID", code: "INVALID_CHALLENGE" };
      }

      if (
        !challenge.mfaMethodId ||
        challenge.mfaEnabledAt ||
        !challenge.pendingExpiresAt ||
        challenge.pendingExpiresAt < now
      ) {
        return { status: "INVALID", code: "INVALID_ENROLLMENT" };
      }

      let emailCodeValid: boolean;
      let recoveryCodeHash: string;
      try {
        emailCodeValid = Boolean(
          challenge.codeHash && proofProvider.verifyEmailCode(challenge.codeHash, code),
        );
        recoveryCodeHash = proofProvider.hashRecoveryCode(code);
      } catch {
        return { status: "FAILED", code: "CODE_PROVIDER_UNAVAILABLE" };
      }

      let recovery = null;
      try {
        if (!emailCodeValid) {
          recovery = await repository.findUnusedRecoveryCode(
            challenge.userId,
            recoveryCodeHash,
          );
        }
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (!emailCodeValid && !recovery) {
        try {
          await repository.incrementChallengeAttempt(challenge.id);
        } catch {
          return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
        }
        return { status: "INVALID", code: "INVALID_CODE" };
      }

      let recoveryMaterial;
      try {
        recoveryMaterial = recoveryCodeProvider.issue(10);
      } catch {
        return { status: "FAILED", code: "RECOVERY_PROVIDER_UNAVAILABLE" };
      }

      if (recoveryMaterial.length !== 10) {
        return { status: "FAILED", code: "RECOVERY_PROVIDER_UNAVAILABLE" };
      }

      let committed;
      try {
        committed = await repository.completeEnrollment({
          userId: challenge.userId,
          challengeId: challenge.id,
          recoveryCodeId: recovery?.id ?? null,
          newRecoveryCodeHashes: recoveryMaterial.map((item) => item.hash),
          completedAt: now,
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (committed === "CHALLENGE_REJECTED") {
        return { status: "INVALID", code: "INVALID_CHALLENGE" };
      }
      if (committed === "RECOVERY_REJECTED") {
        return { status: "INVALID", code: "INVALID_CODE" };
      }
      if (committed === "ENROLLMENT_REJECTED") {
        return { status: "INVALID", code: "INVALID_ENROLLMENT" };
      }

      return {
        status: "COMPLETED",
        userId: challenge.userId,
        verificationMethod: recovery ? "RECOVERY_CODE" : "EMAIL_OTP",
        recoveryCodes: recoveryMaterial.map((item) => item.value),
      };
    },
  });
}
