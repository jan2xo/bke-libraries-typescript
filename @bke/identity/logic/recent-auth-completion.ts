import type {
  IdentityRecentAuthCompletionCapability,
  IdentityRecentAuthCompletionInput,
  IdentityRecentAuthCompletionResult,
} from "../contracts/recent-auth-completion.contract";
import type { IdentitySessionValidationCapability } from "../contracts/session-validation.contract";
import type { IdentityEmailMfaProofProvider } from "./email-mfa-proof-provider";
import type { IdentityPasswordVerifier } from "./password-verifier";
import type { IdentityRecentAuthCompletionRepository } from "./recent-auth-completion-repository";

const MAX_PASSWORD_LENGTH = 128;

export function createIdentityRecentAuthCompletionCapability(
  repository: IdentityRecentAuthCompletionRepository,
  sessionValidation: IdentitySessionValidationCapability,
  passwordVerifier: IdentityPasswordVerifier,
  proofProvider: IdentityEmailMfaProofProvider,
  clock: () => Date = () => new Date(),
): IdentityRecentAuthCompletionCapability {
  return Object.freeze({
    async complete(
      input: IdentityRecentAuthCompletionInput,
    ): Promise<IdentityRecentAuthCompletionResult> {
      const sessionToken = input.sessionToken.trim();
      if (!sessionToken || input.password.length < 1 || input.password.length > MAX_PASSWORD_LENGTH) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const validatedSession = await sessionValidation.validate(sessionToken);
      if (validatedSession.status === "INVALID") {
        return { status: "INVALID", code: "INVALID_SESSION" };
      }
      if (validatedSession.status === "FAILED") {
        return {
          status: "FAILED",
          code:
            validatedSession.code === "TOKEN_PROVIDER_UNAVAILABLE"
              ? "SESSION_PROVIDER_UNAVAILABLE"
              : "PERSISTENCE_UNAVAILABLE",
        };
      }

      const { session, principal } = validatedSession.context;

      let passwordRecord;
      try {
        passwordRecord = await repository.findPasswordRecord(principal.id);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
      if (!passwordRecord) {
        return { status: "INVALID", code: "INVALID_CREDENTIALS" };
      }

      let passwordValid: boolean;
      try {
        passwordValid = await passwordVerifier.verify(
          passwordRecord.passwordHash,
          input.password,
        );
      } catch {
        return { status: "FAILED", code: "PASSWORD_PROVIDER_UNAVAILABLE" };
      }
      if (!passwordValid) {
        return { status: "INVALID", code: "INVALID_CREDENTIALS" };
      }

      const completedAt = clock();

      if (principal.role === "CUSTOMER") {
        let committed;
        try {
          committed = await repository.upgradeCustomerSession({
            sessionId: session.id,
            userId: principal.id,
            completedAt,
          });
        } catch {
          return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
        }
        if (committed.status !== "COMPLETED") {
          return { status: "INVALID", code: "INVALID_SESSION" };
        }
        return {
          status: "COMPLETED",
          session: committed.session,
          verificationMethod: "PASSWORD",
        };
      }

      const challengeToken = input.challengeToken?.trim() ?? "";
      const code = input.code?.trim() ?? "";
      if (!challengeToken || !code) {
        return { status: "INVALID", code: "MFA_REQUIRED" };
      }
      if (code.length < 6 || code.length > 32) {
        return { status: "INVALID", code: "INVALID_CODE" };
      }

      let tokenHash: string;
      try {
        tokenHash = proofProvider.hashChallengeToken(challengeToken);
      } catch {
        return { status: "FAILED", code: "CODE_PROVIDER_UNAVAILABLE" };
      }

      let challenge;
      try {
        challenge = await repository.findRecentAuthChallenge(principal.id, tokenHash);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (
        !challenge ||
        challenge.purpose !== "RECENT_AUTH" ||
        challenge.userId !== principal.id ||
        challenge.consumedAt ||
        challenge.expiresAt <= completedAt ||
        challenge.attemptCount >= 5
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
            principal.id,
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

      let committed;
      try {
        committed = await repository.completeAdminRecentAuth({
          sessionId: session.id,
          userId: principal.id,
          challengeId: challenge.id,
          recoveryCodeId: recovery?.id ?? null,
          completedAt,
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (committed.status === "SESSION_REJECTED") {
        return { status: "INVALID", code: "INVALID_SESSION" };
      }
      if (committed.status === "CHALLENGE_REJECTED") {
        return { status: "INVALID", code: "INVALID_CHALLENGE" };
      }
      if (committed.status === "RECOVERY_REJECTED") {
        return { status: "INVALID", code: "INVALID_CODE" };
      }

      return {
        status: "COMPLETED",
        session: committed.session,
        verificationMethod: recovery
          ? "PASSWORD_RECOVERY"
          : "PASSWORD_EMAIL_OTP",
      };
    },
  });
}
