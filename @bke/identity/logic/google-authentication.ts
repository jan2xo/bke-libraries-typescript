import type {
  IdentityGoogleAuthenticationCapability,
  IdentityGoogleAuthenticationResult,
} from "../contracts/google-authentication.contract";
import type { IdentityGoogleIdentityRepository } from "./google-identity-repository";

function routeFor(role: "CUSTOMER" | "ADMIN", mfaEnabled: boolean) {
  if (mfaEnabled) return "MFA_CHALLENGE" as const;
  return role === "ADMIN" ? "MFA_ENROLLMENT" as const : "SESSION" as const;
}

/** Resolves a host-verified Google subject to its already-bound BKE principal. */
export function createIdentityGoogleAuthenticationCapability(
  repository: IdentityGoogleIdentityRepository,
): IdentityGoogleAuthenticationCapability {
  return Object.freeze({
    async authenticate(
      input: Readonly<{ subject: string }>,
    ): Promise<IdentityGoogleAuthenticationResult> {
      if (!/^[\x21-\x7e]{1,255}$/.test(input.subject)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }
      try {
        const record = await repository.findAuthenticationBySubject(input.subject);
        if (
          !record ||
          record.principal.suspendedAt !== null ||
          record.principal.lifecycleState !== "ACTIVE"
        ) {
          return { status: "INVALID_CREDENTIALS" };
        }
        return {
          status: "PRIMARY_AUTHENTICATED",
          principal: record.principal,
          route: routeFor(record.principal.role, record.mfaEnabled),
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
