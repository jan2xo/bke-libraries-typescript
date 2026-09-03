import { describe, expect, it, vi } from "vitest";
import type { IdentityPersistedSessionContext, IdentitySessionRepository } from "../logic/session-repository";
import type { IdentitySessionTokenProvider } from "../logic/session-token-provider";
import { createIdentitySessionValidationCapability } from "../logic/session-validation";

const now = new Date("2026-08-31T00:00:00.000Z");

const persisted = (overrides: Partial<IdentityPersistedSessionContext> = {}): IdentityPersistedSessionContext => ({
  session: {
    id: "session-1",
    userId: "user-1",
    expiresAt: new Date("2026-09-14T00:00:00.000Z"),
    lastAuthenticatedAt: now,
    mfaVerifiedAt: null,
    recentAuthenticatedAt: now,
    lastSeenAt: new Date("2026-08-30T23:59:00.000Z"),
    absoluteExpiresAt: new Date("2026-09-14T00:00:00.000Z"),
    authenticationMethod: "PASSWORD",
    assuranceLevel: "RECENTLY_AUTHENTICATED",
    createdAt: now,
  },
  principal: {
    id: "user-1",
    email: "person@example.com",
    name: "Person",
    emailVerified: now,
    role: "CUSTOMER",
    establishedAt: new Date("2026-01-01T00:00:00.000Z"),
    suspendedAt: null,
    lifecycleState: "ACTIVE",
  },
  administratorMfaEnabled: false,
  revokedAt: null,
  ...overrides,
});

function repository(record: IdentityPersistedSessionContext | null = persisted()): IdentitySessionRepository {
  return {
    issueSession: vi.fn(),
    findSessionByTokenHash: vi.fn(async () => record),
    revokeSession: vi.fn(async () => undefined),
    touchLastSeen: vi.fn(async () => undefined),
  };
}
function tokenProvider(): IdentitySessionTokenProvider {
  return { issue: vi.fn(), hash: vi.fn(() => "hashed-token") };
}

describe("Identity session validation", () => {
  it("returns TOKEN_MISSING without hashing blank input", async () => {
    const tokens = tokenProvider();
    const validation = createIdentitySessionValidationCapability(repository(), tokens, () => now);
    await expect(validation.validate("   ")).resolves.toEqual({ status: "INVALID", code: "TOKEN_MISSING" });
    expect(tokens.hash).not.toHaveBeenCalled();
  });

  it("returns the current session context for a valid token", async () => {
    const record = persisted();
    const validation = createIdentitySessionValidationCapability(repository(record), tokenProvider(), () => now);
    await expect(validation.validate("raw-token")).resolves.toEqual({ status: "VALID", context: { session: record.session, principal: record.principal, administratorMfaEnabled: false } });
  });

  it("best-effort revokes an expired session and fails closed", async () => {
    const repo = repository(persisted({ session: { ...persisted().session, expiresAt: new Date("2026-08-30T23:59:59.000Z") } }));
    const validation = createIdentitySessionValidationCapability(repo, tokenProvider(), () => now);
    await expect(validation.validate("raw-token")).resolves.toEqual({ status: "INVALID", code: "EXPIRED" });
    expect(repo.revokeSession).toHaveBeenCalledWith("session-1", "EXPIRED", now);
  });

  it("prioritizes account suspension as the invalidation reason", async () => {
    const base = persisted();
    const repo = repository(persisted({ principal: { ...base.principal, suspendedAt: new Date("2026-08-30T23:00:00.000Z") }, session: { ...base.session, expiresAt: new Date("2026-08-30T23:00:00.000Z") } }));
    const validation = createIdentitySessionValidationCapability(repo, tokenProvider(), () => now);
    await expect(validation.validate("raw-token")).resolves.toEqual({ status: "INVALID", code: "ACCOUNT_SUSPENDED" });
    expect(repo.revokeSession).toHaveBeenCalledWith("session-1", "ACCOUNT_SUSPENDED", now);
  });

  it("invalidates sessions idle for more than sixty minutes", async () => {
    const base = persisted();
    const repo = repository(persisted({ session: { ...base.session, lastSeenAt: new Date("2026-08-30T22:59:59.000Z") } }));
    const validation = createIdentitySessionValidationCapability(repo, tokenProvider(), () => now);
    await expect(validation.validate("raw-token")).resolves.toEqual({ status: "INVALID", code: "IDLE_TIMEOUT" });
    expect(repo.revokeSession).toHaveBeenCalledWith("session-1", "IDLE_TIMEOUT", now);
  });

  it("refreshes lastSeenAt only after five minutes", async () => {
    const base = persisted();
    const repo = repository(persisted({ session: { ...base.session, lastSeenAt: new Date("2026-08-30T23:54:59.000Z") } }));
    const validation = createIdentitySessionValidationCapability(repo, tokenProvider(), () => now);
    await expect(validation.validate("raw-token")).resolves.toMatchObject({ status: "VALID" });
    expect(repo.touchLastSeen).toHaveBeenCalledWith("session-1", now);
  });

  it("maps token-provider and persistence failures to typed failures", async () => {
    const brokenTokens: IdentitySessionTokenProvider = { issue: vi.fn(), hash: vi.fn(() => { throw new Error("hash unavailable"); }) };
    const validation = createIdentitySessionValidationCapability(repository(), brokenTokens, () => now);
    await expect(validation.validate("raw-token")).resolves.toEqual({ status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" });
    const repo = repository();
    repo.findSessionByTokenHash = vi.fn(async () => { throw new Error("db unavailable"); });
    const persistenceValidation = createIdentitySessionValidationCapability(repo, tokenProvider(), () => now);
    await expect(persistenceValidation.validate("raw-token")).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
