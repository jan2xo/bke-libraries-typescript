import type {
  IdentityMfaDisableCapability,
  IdentityMfaDisableInput,
  IdentityMfaDisableResult,
} from "../contracts/mfa-disable.contract";
import type { IdentityMfaDisableRepository } from "./mfa-disable-repository";

export function createIdentityMfaDisableCapability(
  repository: IdentityMfaDisableRepository,
  clock: () => Date = () => new Date(),
): IdentityMfaDisableCapability {
  return Object.freeze({
    async disable(
      input: IdentityMfaDisableInput,
    ): Promise<IdentityMfaDisableResult> {
      const userId = input.userId.trim();
      if (!userId) {
        return { status: "INVALID", code: "INVALID_INPUT" };
      }

      const disabledAt = clock();
      let result;
      try {
        result = await repository.disableMfa(userId, disabledAt);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (result.status === "NOT_FOUND") {
        return { status: "INVALID", code: "NOT_FOUND" };
      }
      if (result.status === "FORBIDDEN") {
        return { status: "INVALID", code: "FORBIDDEN" };
      }
      if (result.status === "MFA_NOT_ENABLED") {
        return { status: "INVALID", code: "MFA_NOT_ENABLED" };
      }

      return {
        status: "DISABLED",
        userId,
        disabledAt,
        enrollmentRequired: result.enrollmentRequired,
      };
    },
  });
}
