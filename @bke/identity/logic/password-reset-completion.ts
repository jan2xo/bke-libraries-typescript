import type {
  IdentityPasswordResetCompletionCapability,
  IdentityPasswordResetCompletionInput,
  IdentityPasswordResetCompletionResult,
} from "../contracts/password-reset-completion.contract";
import type { IdentityPasswordHasher } from "./password-hasher";
import type { IdentityPasswordResetCompletionRepository } from "./password-reset-completion-repository";
import type { IdentityPasswordResetTokenProvider } from "./password-reset-token-provider";

const TOKEN_MIN_LENGTH = 20;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const LOWERCASE = /[a-z]/;
const UPPERCASE = /[A-Z]/;
const DIGIT = /[0-9]/;

function validPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    LOWERCASE.test(password) &&
    UPPERCASE.test(password) &&
    DIGIT.test(password)
  );
}

export function createIdentityPasswordResetCompletionCapability(
  repository: IdentityPasswordResetCompletionRepository,
  tokenProvider: IdentityPasswordResetTokenProvider,
  passwordHasher: IdentityPasswordHasher,
  clock: () => Date = () => new Date(),
): IdentityPasswordResetCompletionCapability {
  return Object.freeze({
    async complete(
      input: IdentityPasswordResetCompletionInput,
    ): Promise<IdentityPasswordResetCompletionResult> {
      const token = input.token.trim();
      if (token.length < TOKEN_MIN_LENGTH || !validPassword(input.password)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let tokenHash: string;
      try {
        tokenHash = tokenProvider.hash(token);
      } catch {
        return { status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" };
      }

      let record;
      try {
        record = await repository.findTokenByHash(tokenHash);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      const completedAt = clock();
      if (!record || record.usedAt || record.expiresAt < completedAt) {
        return { status: "INVALID", code: "INVALID_TOKEN" };
      }

      let passwordHash: string;
      try {
        passwordHash = await passwordHasher.hash(input.password);
      } catch {
        return { status: "FAILED", code: "PASSWORD_PROVIDER_UNAVAILABLE" };
      }

      let committed;
      try {
        committed = await repository.complete({
          tokenId: record.id,
          userId: record.userId,
          passwordHash,
          completedAt,
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (committed.status !== "COMPLETED") {
        return { status: "INVALID", code: "INVALID_TOKEN" };
      }

      return {
        status: "COMPLETED",
        userId: record.userId,
        role: record.role,
      };
    },
  });
}
