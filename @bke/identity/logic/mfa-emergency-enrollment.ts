import type {
  IdentityMfaEmergencyEnrollmentCapability,
  IdentityMfaEmergencyEnrollmentInput,
  IdentityMfaEmergencyEnrollmentResult,
} from "../contracts/mfa-emergency-enrollment.contract";
import type { IdentitySessionValidationCapability } from "../contracts/session-validation.contract";
import type { IdentityMfaRecoveryCodeProvider } from "./mfa-recovery-code-provider";
import type { IdentityMfaEmergencyEnrollmentRepository } from "./mfa-emergency-enrollment-repository";
import type { IdentitySessionTokenProvider } from "./session-token-provider";

const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1000;
const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;
const EMERGENCY_TOKEN_MIN_LENGTH = 40;
const EMERGENCY_TOKEN_MAX_LENGTH = 256;

export function createIdentityMfaEmergencyEnrollmentCapability(
  repository: IdentityMfaEmergencyEnrollmentRepository,
  sessionValidation: IdentitySessionValidationCapability,
  sessionTokenProvider: IdentitySessionTokenProvider,
  recoveryCodeProvider: IdentityMfaRecoveryCodeProvider,
  clock: () => Date = () => new Date(),
): IdentityMfaEmergencyEnrollmentCapability {
  return Object.freeze({
    async enroll(
      input: IdentityMfaEmergencyEnrollmentInput,
    ): Promise<IdentityMfaEmergencyEnrollmentResult> {
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

      if (validated.context.principal.role !== "ADMIN") {
        return { status: "INVALID", code: "FORBIDDEN" };
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
        input.emergencyToken.length < EMERGENCY_TOKEN_MIN_LENGTH ||
        input.emergencyToken.length > EMERGENCY_TOKEN_MAX_LENGTH
      ) {
        return { status: "INVALID", code: "INVALID_EMERGENCY_ENROLLMENT" };
      }

      let emergencyTokenHash: string;
      let replacementSession;
      try {
        emergencyTokenHash = sessionTokenProvider.hash(input.emergencyToken);
        replacementSession = sessionTokenProvider.issue();
      } catch {
        return { status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" };
      }

      let recoveryMaterial;
      try {
        recoveryMaterial = recoveryCodeProvider.issue(RECOVERY_CODE_COUNT);
      } catch {
        return { status: "FAILED", code: "CODE_PROVIDER_UNAVAILABLE" };
      }
      if (recoveryMaterial.length !== RECOVERY_CODE_COUNT) {
        return { status: "FAILED", code: "CODE_PROVIDER_UNAVAILABLE" };
      }

      let committed;
      try {
        committed = await repository.enroll({
          userId: validated.context.principal.id,
          emergencyTokenHash,
          recoveryCodeHashes: recoveryMaterial.map((item) => item.hash),
          replacementSession,
          enrolledAt: now,
          replacementSessionExpiresAt: new Date(
            now.getTime() + SESSION_LIFETIME_MS,
          ),
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (committed.status === "INVALID_AUTHORIZATION") {
        return { status: "INVALID", code: "INVALID_EMERGENCY_ENROLLMENT" };
      }

      return {
        status: "ENROLLED",
        userId: validated.context.principal.id,
        recoveryCodes: recoveryMaterial.map((item) => item.value),
        replacementSessionToken: replacementSession.token,
        auditContext: {
          authorizationId: committed.authorizationId,
          ownerKeyVersion: committed.ownerKeyVersion,
          deploymentEnvironment: committed.deploymentEnvironment,
        },
      };
    },
  });
}
