import { describe, expect, it, vi } from "vitest";
import { createIdentityMagicLoginConsumeCapability } from "../logic/magic-login-consume";
import type {
  IdentityMagicLoginConsumePersistenceResult,
  IdentityMagicLoginConsumeRepository,
} from "../logic/magic-login-consume-repository";
import type { IdentityMagicLoginTokenProvider } from "../logic/magic-login-token-provider";
import type { IdentitySessionTokenProvider } from "../logic/session-token-provider";

const now = new Date("2026-08-31T14:30:00.000Z");
const issuedSession = {
  id: "session-1",
  userId: "user-1",
  expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60_000),
  lastAuthenticatedAt: now,
  mfaVerifiedAt: null,
  recentAuthenticatedAt: null,
  lastSeenAt: now,
  absoluteExpiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60_000),
  authenticationMethod: "MAGIC_LINK" as const,
  assuranceLevel: "BASIC" as const,
  createdAt: now,
};

function harness(
  persisted: IdentityMagicLoginConsumePersistenceResult = {
    status: "AUTHENTICATED",
    userId: "user-1",
    session: issuedSession,
  },
) {
  const repository: IdentityMagicLoginConsumeRepository = {
    consumeAndIssueSession: vi.fn(async () => persisted),
  };
  const magicTokenProvider: IdentityMagicLoginTokenProvider = {
    issue: vi.fn(() => ({
      tokenId: "unused",
      token: "unused-magic-token",
      tokenHash: "unused-magic-hash",
    })),
    hash: vi.fn(() => "hashed-magic-token"),
  };
  const sessionTokenProvider: IdentitySessionTokenProvider = {
    issue: vi.fn(() => ({
      sessionId: "session-1",
      token: "raw-session-token",
      tokenHash: "hashed-session-token",
    })),
    hash: vi.fn(() => "hashed-session-token"),
  };
  return {
    repository,
    magicTokenProvider,
    sessionTokenProvider,
    capability: createIdentityMagicLoginConsumeCapability(
      repository,
      magicTokenProvider,
      sessionTokenProvider,
      () => now,
    ),
  };
}

describe("Identity magic-login consume", () => {
  it("hashes the exact proof and atomically requests a BASIC MAGIC_LINK session", async () => {
    const h = harness();
    const result = await h.capability.consume({
      token: "raw-magic-token-long-enough",
      userAgentSummary: "Browser",
      networkHint: "network",
    });

    expect(result).toEqual({
      status: "AUTHENTICATED",
      userId: "user-1",
      role: "CUSTOMER",
      token: "raw-session-token",
      session: issuedSession,
    });
    expect(h.magicTokenProvider.hash).toHaveBeenCalledWith("raw-magic-token-long-enough");
    expect(h.repository.consumeAndIssueSession).toHaveBeenCalledWith(
      "hashed-magic-token",
      now,
      {
        id: "session-1",
        tokenHash: "hashed-session-token",
        expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60_000),
        authenticatedAt: now,
        userAgentSummary: "Browser",
        networkHint: "network",
      },
    );
  });

  it("preserves typed invalid/admin/inactive rejection semantics", async () => {
    await expect(
      harness({ status: "INVALID_TOKEN" }).capability.consume({ token: "x" }),
    ).resolves.toEqual({ status: "REJECTED", code: "INVALID_TOKEN" });

    await expect(
      harness({ status: "ADMIN_PASSWORD_REQUIRED", userId: "admin-1" }).capability.consume({
        token: "raw-magic-token-long-enough",
      }),
    ).resolves.toEqual({
      status: "REJECTED",
      code: "ADMIN_PASSWORD_REQUIRED",
      userId: "admin-1",
    });

    await expect(
      harness({ status: "ACCOUNT_NOT_ACTIVE", userId: "user-1" }).capability.consume({
        token: "raw-magic-token-long-enough",
      }),
    ).resolves.toEqual({
      status: "REJECTED",
      code: "ACCOUNT_NOT_ACTIVE",
      userId: "user-1",
    });
  });

  it("treats only a missing proof as INVALID_TOKEN and does not normalize supplied proof bytes", async () => {
    const empty = harness();
    await expect(empty.capability.consume({ token: "" })).resolves.toEqual({
      status: "REJECTED",
      code: "INVALID_TOKEN",
    });
    expect(empty.magicTokenProvider.hash).not.toHaveBeenCalled();
    expect(empty.sessionTokenProvider.issue).not.toHaveBeenCalled();
    expect(empty.repository.consumeAndIssueSession).not.toHaveBeenCalled();

    const exact = harness({ status: "INVALID_TOKEN" });
    await exact.capability.consume({ token: " x " });
    expect(exact.magicTokenProvider.hash).toHaveBeenCalledWith(" x ");
    expect(exact.repository.consumeAndIssueSession).toHaveBeenCalled();
  });

  it("returns typed token-provider and persistence failures", async () => {
    const providerFailure = harness();
    vi.mocked(providerFailure.sessionTokenProvider.issue).mockImplementation(() => {
      throw new Error("provider unavailable");
    });
    await expect(
      providerFailure.capability.consume({ token: "raw-magic-token-long-enough" }),
    ).resolves.toEqual({ status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" });

    const persistenceFailure = harness();
    vi.mocked(persistenceFailure.repository.consumeAndIssueSession).mockRejectedValue(
      new Error("postgres unavailable"),
    );
    await expect(
      persistenceFailure.capability.consume({ token: "raw-magic-token-long-enough" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
