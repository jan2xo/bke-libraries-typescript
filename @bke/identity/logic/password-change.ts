import type {
  IdentityPasswordChangeCapability,
  IdentityPasswordChangeInput,
  IdentityPasswordChangeResult,
} from "../contracts/password-change.contract";
import type { IdentitySessionAuthenticationMethod } from "../contracts/session.contract";
import type { IdentityPasswordChangeRepository } from "./password-change-repository";
import type { IdentityPasswordHasher } from "./password-hasher";
import type { IdentityPasswordVerifier } from "./password-verifier";
import type { IdentitySessionValidationCapability } from "../contracts/session-validation.contract";

const CURRENT_PASSWORD_MIN_LENGTH = 1;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1000;
const LOWERCASE = /[a-z]/;
const UPPERCASE = /[A-Z]/;
const DIGIT = /[0-9]/;

function validNewPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    LOWERCASE.test(password) &&
    UPPERCASE.test(password) &&
    DIGIT.test(password)
  );
}

function replacementMethod(
  role: "CUSTOMER" | "ADMIN",
): IdentitySessionAuthenticationMethod {
  return role === "ADMIN" ? "PASSWORD_EMAIL_OTP" : "PASSWORD";
}

export function createIdentityPasswordChangeCapability(
  repository: IdentityPasswordChangeRepository,
  sessionValidation: IdentitySessionValidationCapability,
  passwordVerifier: IdentityPasswordVerifier,
  passwordHasher: IdentityPasswordHasher,
  clock: () => Date = () => new Date(),
): IdentityPasswordChangeCapability {
  return Object.freeze({
    async change(
      input: IdentityPasswordChangeInput,
    ): Promise<IdentityPasswordChangeResult> {
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
        input.currentPassword.length < CURRENT_PASSWORD_MIN_LENGTH ||
        input.currentPassword.length > PASSWORD_MAX_LENGTH ||
        !validNewPassword(input.newPassword)
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      const userId = validated.context.principal.id;
      let credential;
      try {
        credential = await repository.findCredentialByUserId(userId);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (!credential) {
        return { status: "INVALID", code: "INVALID_CREDENTIALS" };
      }

      let currentPasswordValid = false;
      try {
        currentPasswordValid = await passwordVerifier.verify(
          credential.passwordHash,
          input.currentPassword,
        );
      } catch {
        currentPasswordValid = false;
      }
      if (!currentPasswordValid) {
        return { status: "INVALID", code: "INVALID_CREDENTIALS" };
      }

      let passwordHash: string;
      try {
        passwordHash = await passwordHasher.hash(input.newPassword);
      } catch {
        return { status: "FAILED", code: "PASSWORD_PROVIDER_UNAVAILABLE" };
      }

      try {
        await repository.changePassword({
          userId,
          passwordHash,
          changedAt: now,
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      return {
        status: "CHANGED",
        userId,
        role: validated.context.principal.role,
        replacementAuthenticationMethod: replacementMethod(
          validated.context.principal.role,
        ),
      };
    },
  });
}
