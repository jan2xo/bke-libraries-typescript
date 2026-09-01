import type {
  IdentitySessionValidationCapability,
  IdentitySessionValidationResult,
} from "../contracts/session-validation.contract";
import type {
  IdentitySessionRepository,
  IdentitySessionRevocationReason,
} from "./session-repository";
import type { IdentitySessionTokenProvider } from "./session-token-provider";

const SESSION_IDLE_MS = 60 * 60_000;
const SESSION_TOUCH_MS = 5 * 60_000;

async function invalidate(
  repository: IdentitySessionRepository,
  sessionId: string,
  reason: IdentitySessionRevocationReason,
  now: Date,
  code: "ACCOUNT_SUSPENDED" | "EXPIRED" | "IDLE_TIMEOUT",
): Promise<IdentitySessionValidationResult> {
  await repository.revokeSession(sessionId, reason, now).catch(() => undefined);
  return { status: "INVALID", code };
}

export function createIdentitySessionValidationCapability(
  repository: IdentitySessionRepository,
  tokenProvider: IdentitySessionTokenProvider,
  nowProvider: () => Date = () => new Date(),
): IdentitySessionValidationCapability {
  return Object.freeze({
    async validate(token: string): Promise<IdentitySessionValidationResult> {
      if (!token || !token.trim()) {
        return { status: "INVALID", code: "TOKEN_MISSING" };
      }

      let tokenHash: string;
      try {
        tokenHash = tokenProvider.hash(token);
      } catch {
        return { status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" };
      }

      let persisted;
      try {
        persisted = await repository.findSessionByTokenHash(tokenHash);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      if (!persisted) {
        return { status: "INVALID", code: "SESSION_NOT_FOUND" };
      }
      if (persisted.revokedAt) {
        return { status: "INVALID", code: "SESSION_REVOKED" };
      }

      const now = nowProvider();
      const { session, principal } = persisted;

      if (principal.suspendedAt) {
        return invalidate(
          repository,
          session.id,
          "ACCOUNT_SUSPENDED",
          now,
          "ACCOUNT_SUSPENDED",
        );
      }
      if (session.expiresAt <= now || session.absoluteExpiresAt <= now) {
        return invalidate(repository, session.id, "EXPIRED", now, "EXPIRED");
      }
      if (session.lastSeenAt < new Date(now.getTime() - SESSION_IDLE_MS)) {
        return invalidate(
          repository,
          session.id,
          "IDLE_TIMEOUT",
          now,
          "IDLE_TIMEOUT",
        );
      }

      if (session.lastSeenAt < new Date(now.getTime() - SESSION_TOUCH_MS)) {
        try {
          await repository.touchLastSeen(session.id, now);
        } catch {
          return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
        }
      }

      return {
        status: "VALID",
        context: {
          session,
          principal,
          administratorMfaEnabled: persisted.administratorMfaEnabled,
        },
      };
    },
  });
}
