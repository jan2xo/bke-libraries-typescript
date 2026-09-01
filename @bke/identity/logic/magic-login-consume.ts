import type {
  IdentityMagicLoginConsumeCapability,
  IdentityMagicLoginConsumeInput,
  IdentityMagicLoginConsumeResult,
} from "../contracts/magic-login-consume.contract";
import type { IdentityMagicLoginConsumeRepository } from "./magic-login-consume-repository";
import type { IdentityMagicLoginTokenProvider } from "./magic-login-token-provider";
import type { IdentitySessionTokenProvider } from "./session-token-provider";

const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

export function createIdentityMagicLoginConsumeCapability(
  repository: IdentityMagicLoginConsumeRepository,
  magicTokenProvider: IdentityMagicLoginTokenProvider,
  sessionTokenProvider: IdentitySessionTokenProvider,
  clock: () => Date = () => new Date(),
): IdentityMagicLoginConsumeCapability {
  return Object.freeze({
    async consume(input: IdentityMagicLoginConsumeInput): Promise<IdentityMagicLoginConsumeResult> {
      const token = input.token;
      if (!token) {
        return { status: "REJECTED", code: "INVALID_TOKEN" };
      }

      let magicTokenHash: string;
      let sessionMaterial;
      try {
        magicTokenHash = magicTokenProvider.hash(token);
        sessionMaterial = sessionTokenProvider.issue();
      } catch {
        return { status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" };
      }

      const now = clock();
      const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);

      try {
        const persisted = await repository.consumeAndIssueSession(
          magicTokenHash,
          now,
          {
            id: sessionMaterial.sessionId,
            tokenHash: sessionMaterial.tokenHash,
            expiresAt,
            authenticatedAt: now,
            userAgentSummary: input.userAgentSummary ?? null,
            networkHint: input.networkHint ?? null,
          },
        );

        if (persisted.status === "INVALID_TOKEN") {
          return { status: "REJECTED", code: "INVALID_TOKEN" };
        }
        if (persisted.status === "ADMIN_PASSWORD_REQUIRED") {
          return {
            status: "REJECTED",
            code: "ADMIN_PASSWORD_REQUIRED",
            userId: persisted.userId,
          };
        }
        if (persisted.status === "ACCOUNT_NOT_ACTIVE") {
          return {
            status: "REJECTED",
            code: "ACCOUNT_NOT_ACTIVE",
            userId: persisted.userId,
          };
        }

        return {
          status: "AUTHENTICATED",
          userId: persisted.userId,
          role: "CUSTOMER",
          token: sessionMaterial.token,
          session: persisted.session,
        };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
