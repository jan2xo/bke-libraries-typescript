import type {
  IdentityGooglePrincipalBindingCapability,
  IdentityGooglePrincipalLookupResult,
  IdentityGoogleSubjectBindResult,
} from "../contracts/google-identity.contract";
import type { IdentityGoogleIdentityRepository } from "./google-identity-repository";

const validSubject = (subject: string): boolean => /^[\x21-\x7e]{1,255}$/.test(subject);

export function createIdentityGooglePrincipalBindingCapability(
  repository: IdentityGoogleIdentityRepository,
): IdentityGooglePrincipalBindingCapability {
  return Object.freeze({
    async bindToUser(
      input: Readonly<{ userId: string; subject: string }>,
    ): Promise<IdentityGoogleSubjectBindResult> {
      const userId = input.userId.trim();
      if (!userId || !validSubject(input.subject)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        const result = await repository.bindSubject(userId, input.subject);
        if (result.status === "BOUND" || result.status === "ALREADY_BOUND") {
          return { status: result.status, userId };
        }
        return { status: "REJECTED", code: result.status };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },

    async findPrincipalBySubject(
      input: Readonly<{ subject: string }>,
    ): Promise<IdentityGooglePrincipalLookupResult> {
      if (!validSubject(input.subject)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        const principal = await repository.findPrincipalBySubject(input.subject);
        return principal ? { status: "FOUND", principal } : { status: "NOT_FOUND" };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
