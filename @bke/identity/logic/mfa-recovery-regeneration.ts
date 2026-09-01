import type {
  IdentityMfaRecoveryRegenerationCapability,
  IdentityMfaRecoveryRegenerationInput,
  IdentityMfaRecoveryRegenerationResult,
} from "../contracts/mfa-recovery-regeneration.contract";
import type { IdentitySessionValidationCapability } from "../contracts/session-validation.contract";
import type { IdentityMfaRecoveryCodeProvider } from "./mfa-recovery-code-provider";
import type { IdentityMfaRecoveryRegenerationRepository } from "./mfa-recovery-regeneration-repository";

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;

export function createIdentityMfaRecoveryRegenerationCapability(
  repository: IdentityMfaRecoveryRegenerationRepository,
  sessionValidation: IdentitySessionValidationCapability,
  recoveryCodeProvider: IdentityMfaRecoveryCodeProvider,
  clock: () => Date = () => new Date(),
): IdentityMfaRecoveryRegenerationCapability {
  return Object.freeze({
    async regenerate(
      input: IdentityMfaRecoveryRegenerationInput,
    ): Promise<IdentityMfaRecoveryRegenerationResult> {
      let validated;
      try {
        validated = await sessionValidation.validate(input.sessionToken);
      } catch {
        return { status: "FAILED", code: "SESSION_PROVIDER_UNAVAILABLE" };
      }

      if (validated.status === "FAILED") {
        return { status: "FAILED", code: "SESSION_PROVIDER_UNAVAILABLE" };
      }
      if (validated.status === "INVALID") {
        return { status: "INVALID", code: "INVALID_SESSION" };
      }

      const now = clock();
      const recentAuthenticatedAt =
        validated.context.session.recentAuthenticatedAt;
      if (
        !recentAuthenticatedAt ||
        recentAuthenticatedAt < new Date(now.getTime() - RECENT_AUTH_MAX_AGE_MS)
      ) {
        return { status: "INVALID", code: "RECENT_AUTH_REQUIRED" };
      }

      if (
        validated.context.principal.role !== "ADMIN" ||
        !validated.context.session.mfaVerifiedAt ||
        !validated.context.administratorMfaEnabled
      ) {
        return { status: "INVALID", code: "FORBIDDEN" };
      }

      let materials;
      try {
        materials = recoveryCodeProvider.issue(RECOVERY_CODE_COUNT);
      } catch {
        return { status: "FAILED", code: "CODE_PROVIDER_UNAVAILABLE" };
      }

      try {
        await repository.regenerate({
          userId: validated.context.principal.id,
          recoveryCodeHashes: materials.map((material) => material.hash),
          regeneratedAt: now,
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      return {
        status: "REGENERATED",
        userId: validated.context.principal.id,
        recoveryCodes: materials.map((material) => material.value),
        replacementAuthenticationMethod: "PASSWORD_EMAIL_OTP",
      };
    },
  });
}
