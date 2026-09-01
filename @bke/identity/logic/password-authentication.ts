import type {
  IdentityPasswordAuthenticationCapability,
  IdentityPasswordAuthenticationInput,
  IdentityPasswordAuthenticationResult,
  IdentityPrimaryAuthenticationRoute,
} from "../contracts/identity.contract";
import type { IdentityRepository } from "./identity-repository";
import type { IdentityPasswordVerifier } from "./password-verifier";

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const BASIC_EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(rawEmail: string): string | null {
  const email = rawEmail.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !BASIC_EMAIL_SHAPE.test(email)) {
    return null;
  }
  return email;
}

function routeFor(
  role: "CUSTOMER" | "ADMIN",
  administratorMfaEnabled: boolean,
): IdentityPrimaryAuthenticationRoute {
  if (role === "CUSTOMER") {
    return "CUSTOMER_SESSION";
  }
  return administratorMfaEnabled
    ? "ADMIN_MFA_CHALLENGE"
    : "ADMIN_MFA_ENROLLMENT";
}

export function createIdentityPasswordAuthenticationCapability(
  repository: IdentityRepository,
  passwordVerifier: IdentityPasswordVerifier,
): IdentityPasswordAuthenticationCapability {
  return Object.freeze({
    async authenticate(
      input: IdentityPasswordAuthenticationInput,
    ): Promise<IdentityPasswordAuthenticationResult> {
      const email = normalizeEmail(input.email);
      if (!email || input.password.length < 1 || input.password.length > MAX_PASSWORD_LENGTH) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let record;
      try {
        record = await repository.findPasswordAuthenticationByEmail(email);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      // Deliberately collapse missing user, missing password credential, bad
      // password, and malformed legacy hashes into the same public result.
      if (!record) {
        return { status: "INVALID_CREDENTIALS" };
      }

      let passwordValid = false;
      try {
        passwordValid = await passwordVerifier.verify(
          record.passwordHash,
          input.password,
        );
      } catch {
        passwordValid = false;
      }

      if (!passwordValid) {
        return { status: "INVALID_CREDENTIALS" };
      }

      return {
        status: "PRIMARY_AUTHENTICATED",
        principal: record.principal,
        route: routeFor(
          record.principal.role,
          record.administratorMfaEnabled,
        ),
      };
    },
  });
}
