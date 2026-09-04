import type {
  IdentitySessionAdministrationCapability,
  IdentitySessionAdministrationInput,
  IdentitySessionAdministrationResult,
} from "../contracts/session-administration.contract";
import type { IdentitySessionAdministrationRepository } from "./session-administration-repository";

export function createIdentitySessionAdministrationCapability(
  repository: IdentitySessionAdministrationRepository,
  clock: () => Date = () => new Date(),
): IdentitySessionAdministrationCapability {
  return Object.freeze({
    async revoke(
      input: IdentitySessionAdministrationInput,
    ): Promise<IdentitySessionAdministrationResult> {
      const userId = input.userId.trim();
      const currentSessionId = input.currentSessionId.trim();
      const targetSessionId = input.targetSessionId?.trim() ?? null;

      if (
        !userId ||
        !currentSessionId ||
        (input.action === "ONE" && !targetSessionId) ||
        (input.action !== "ONE" && targetSessionId !== null)
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        const persisted = await repository.revokeAdministratorSessions({
          userId,
          currentSessionId,
          action: input.action,
          targetSessionId,
          revokedAt: clock(),
        });
        if (persisted.status !== "REVOKED") {
          return { status: "REJECTED", code: persisted.status };
        }
        return {
          status: "REVOKED",
          action: input.action,
          signedOut: persisted.signedOut,
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
