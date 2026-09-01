import { describe, expect, it } from "vitest";
import { createIdentitySessionIssuanceCapability } from "../logic/session-issuance";
import type {
  IdentitySessionPersistenceInput,
  IdentitySessionRepository,
} from "../logic/session-repository";
import type { IdentitySessionTokenProvider } from "../logic/session-token-provider";

const now = new Date("2026-08-31T00:00:00.000Z");

function repository(
  issueSession: IdentitySessionRepository["issueSession"] = async (input) => ({
    status: "CREATED",
    session: {
      id: input.id,
      userId: input.userId,
      expiresAt: input.expiresAt,
      lastAuthenticatedAt: input.lastAuthenticatedAt,
      mfaVerifiedAt: input.mfaVerifiedAt,
      recentAuthenticatedAt: input.recentAuthenticatedAt,
      lastSeenAt: input.lastSeenAt,
      absoluteExpiresAt: input.absoluteExpiresAt,
      authenticationMethod: input.authenticationMethod,
      assuranceLevel: input.assuranceLevel,
      createdAt: now,
    },
  }),
): IdentitySessionRepository {
  return {
    issueSession,
    findSessionByTokenHash: async () => null,
    revokeSession: async () => undefined,
    touchLastSeen: async () => undefined,
  };
}

function tokenProvider(
  issue: IdentitySessionTokenProvider["issue"] = () => ({
    sessionId: "session-1",
    token: "raw-session-token",
    tokenHash: "hashed-session-token",
  }),
): IdentitySessionTokenProvider {
  return {
    issue,
    hash: (token) => `hashed:${token}`,
  };
}

describe("Identity session issuance capability", () => {
  it("issues a password session with the V1 14-day recent-authentication semantics", async () => {
    let persisted: IdentitySessionPersistenceInput | undefined;
    const sessions = createIdentitySessionIssuanceCapability(
      repository(async (input) => {
        persisted = input;
        return {
          status: "CREATED",
          session: {
            id: input.id,
            userId: input.userId,
            expiresAt: input.expiresAt,
            lastAuthenticatedAt: input.lastAuthenticatedAt,
            mfaVerifiedAt: input.mfaVerifiedAt,
            recentAuthenticatedAt: input.recentAuthenticatedAt,
            lastSeenAt: input.lastSeenAt,
            absoluteExpiresAt: input.absoluteExpiresAt,
            authenticationMethod: input.authenticationMethod,
            assuranceLevel: input.assuranceLevel,
            createdAt: now,
          },
        };
      }),
      tokenProvider(),
      () => now,
    );

    const result = await sessions.issue({
      userId: " user-1 ",
      authenticationMethod: "PASSWORD",
      userAgentSummary: "Browser",
      networkHint: "Network",
    });

    expect(result.status).toBe("ISSUED");
    if (result.status !== "ISSUED") throw new Error("Expected issued session");
    expect(result.token).toBe("raw-session-token");
    expect(result.session.expiresAt.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(persisted).toMatchObject({
      id: "session-1",
      tokenHash: "hashed-session-token",
      userId: "user-1",
      mfaVerifiedAt: null,
      recentAuthenticatedAt: now,
      authenticationMethod: "PASSWORD",
      assuranceLevel: "RECENTLY_AUTHENTICATED",
      userAgentSummary: "Browser",
      networkHint: "Network",
    });
  });

  it("issues magic-link sessions at BASIC assurance without recent authentication", async () => {
    let persisted: IdentitySessionPersistenceInput | undefined;
    const sessions = createIdentitySessionIssuanceCapability(
      repository(async (input) => {
        persisted = input;
        return {
          status: "CREATED",
          session: { ...input, createdAt: now },
        };
      }),
      tokenProvider(),
      () => now,
    );

    await sessions.issue({ userId: "user-1", authenticationMethod: "MAGIC_LINK" });
    expect(persisted).toMatchObject({
      mfaVerifiedAt: null,
      recentAuthenticatedAt: null,
      authenticationMethod: "MAGIC_LINK",
      assuranceLevel: "BASIC",
    });
  });

  it("marks completed MFA authentication as MFA-verified and recent", async () => {
    let persisted: IdentitySessionPersistenceInput | undefined;
    const sessions = createIdentitySessionIssuanceCapability(
      repository(async (input) => {
        persisted = input;
        return {
          status: "CREATED",
          session: { ...input, createdAt: now },
        };
      }),
      tokenProvider(),
      () => now,
    );

    await sessions.issue({
      userId: "admin-1",
      authenticationMethod: "PASSWORD_EMAIL_OTP",
    });
    expect(persisted).toMatchObject({
      mfaVerifiedAt: now,
      recentAuthenticatedAt: now,
      assuranceLevel: "RECENTLY_AUTHENTICATED",
    });
  });

  it("maps principal and account-state rejections without exposing a token", async () => {
    const missing = createIdentitySessionIssuanceCapability(
      repository(async () => ({ status: "PRINCIPAL_NOT_FOUND" })),
      tokenProvider(),
      () => now,
    );
    const inactive = createIdentitySessionIssuanceCapability(
      repository(async () => ({ status: "ACCOUNT_NOT_ACTIVE" })),
      tokenProvider(),
      () => now,
    );

    await expect(
      missing.issue({ userId: "missing", authenticationMethod: "PASSWORD" }),
    ).resolves.toEqual({ status: "REJECTED", code: "PRINCIPAL_NOT_FOUND" });
    await expect(
      inactive.issue({ userId: "inactive", authenticationMethod: "PASSWORD" }),
    ).resolves.toEqual({ status: "REJECTED", code: "ACCOUNT_NOT_ACTIVE" });
  });

  it("rejects blank user ids before token generation or persistence", async () => {
    let tokenCalled = false;
    let persistenceCalled = false;
    const sessions = createIdentitySessionIssuanceCapability(
      repository(async () => {
        persistenceCalled = true;
        return { status: "PRINCIPAL_NOT_FOUND" };
      }),
      tokenProvider(() => {
        tokenCalled = true;
        return {
          sessionId: "unused",
          token: "unused",
          tokenHash: "unused",
        };
      }),
      () => now,
    );

    await expect(
      sessions.issue({ userId: "   ", authenticationMethod: "PASSWORD" }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(tokenCalled).toBe(false);
    expect(persistenceCalled).toBe(false);
  });

  it("maps token and persistence failures to typed fail-closed results", async () => {
    const tokenFailure = createIdentitySessionIssuanceCapability(
      repository(),
      tokenProvider(() => {
        throw new Error("entropy unavailable");
      }),
      () => now,
    );
    const persistenceFailure = createIdentitySessionIssuanceCapability(
      repository(async () => {
        throw new Error("database unavailable");
      }),
      tokenProvider(),
      () => now,
    );

    await expect(
      tokenFailure.issue({ userId: "user-1", authenticationMethod: "PASSWORD" }),
    ).resolves.toEqual({ status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" });
    await expect(
      persistenceFailure.issue({ userId: "user-1", authenticationMethod: "PASSWORD" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
