import type {
  IdentityLoginMfaVerificationCapability,
  IdentityLoginMfaVerificationInput,
  IdentityLoginMfaVerificationResult,
} from "../contracts/login-mfa-verification.contract";
import type { IdentityLoginMfaProofProvider } from "./login-mfa-proof-provider";
import type { IdentityLoginMfaRepository } from "./login-mfa-repository";

export function createIdentityLoginMfaVerificationCapability(
  repository: IdentityLoginMfaRepository,
  proofProvider: IdentityLoginMfaProofProvider,
  clock: () => Date = () => new Date(),
): IdentityLoginMfaVerificationCapability {
  return Object.freeze({
    async verify(
      input: IdentityLoginMfaVerificationInput,
    ): Promise<IdentityLoginMfaVerificationResult> {
      const challengeToken = input.challengeToken.trim();
      const code = input.code.trim();
      if (!challengeToken) {
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
        challenge = await repository.findChallengeByTokenHash(tokenHash);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      const now = clock();
      if (
        !challenge ||
        challenge.purpose !== "LOGIN" ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.attemptCount >= 5 ||
        challenge.userRole !== "ADMIN"
      ) {
        return { status: "INVALID", code: "INVALID_CHALLENGE" };
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

      let consumed;
      try {
        consumed = await repository.consumeChallenge(
          challenge.id,
          recovery?.id ?? null,
          now,
        );
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (consumed === "CHALLENGE_REJECTED") {
        return { status: "INVALID", code: "INVALID_CHALLENGE" };
      }
      if (consumed === "RECOVERY_REJECTED") {
        return { status: "INVALID", code: "INVALID_CODE" };
      }

      return {
        status: "VERIFIED",
        userId: challenge.userId,
        authenticationMethod: recovery
          ? "PASSWORD_RECOVERY"
          : "PASSWORD_EMAIL_OTP",
      };
    },
  });
}
