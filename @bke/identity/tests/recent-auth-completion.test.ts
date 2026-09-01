import { describe, expect, it, vi } from "vitest";
import type { IdentityIssuedSession } from "../contracts/session.contract";
import type { IdentitySessionValidationCapability } from "../contracts/session-validation.contract";
import type { IdentityEmailMfaProofProvider } from "../logic/email-mfa-proof-provider";
import type { IdentityPasswordVerifier } from "../logic/password-verifier";
import { createIdentityRecentAuthCompletionCapability } from "../logic/recent-auth-completion";
import type { IdentityRecentAuthCompletionRepository } from "../logic/recent-auth-completion-repository";

const now = new Date("2026-08-31T04:00:00.000Z");

function session(userId: string): IdentityIssuedSession {
  return {
    id: `session-${userId}`,
    userId,
    expiresAt: new Date(now.getTime() + 60_000),
    lastAuthenticatedAt: new Date(now.getTime() - 60_000),
    mfaVerifiedAt: new Date(now.getTime() - 30_000),
    recentAuthenticatedAt: null,
    lastSeenAt: now,
    absoluteExpiresAt: new Date(now.getTime() + 120_000),
    authenticationMethod: "PASSWORD_EMAIL_OTP",
    assuranceLevel: "MFA_VERIFIED",
    createdAt: new Date(now.getTime() - 120_000),
  };
}

function completedSession(userId: string): IdentityIssuedSession {
  return {
    ...session(userId),
    recentAuthenticatedAt: now,
    assuranceLevel: "RECENTLY_AUTHENTICATED",
  };
}

function createHarness(role: "CUSTOMER" | "ADMIN" = "ADMIN") {
  const issued = session("user-1");
  const sessionValidation: IdentitySessionValidationCapability = {
    validate: vi.fn(async () => ({
      status: "VALID" as const,
      context: {
        session: issued,
        principal: {
          id: "user-1",
          email: "user-1@example.com",
          name: "User One",
          emailVerified: now,
          role,
          suspendedAt: null,
          lifecycleState: "ACTIVE" as const,
        },
        administratorMfaEnabled: role === "ADMIN",
      },
    })),
  };
  const repository: IdentityRecentAuthCompletionRepository = {
    findPasswordRecord: vi.fn(async () => ({ passwordHash: "hash" })),
    findRecentAuthChallenge: vi.fn(async () => ({
      id: "challenge-1",
      userId: "user-1",
      purpose: "RECENT_AUTH" as const,
      codeHash: "email-code-hash",
      expiresAt: new Date(now.getTime() + 60_000),
      consumedAt: null,
      attemptCount: 0,
    })),
    findUnusedRecoveryCode: vi.fn(async () => null),
    incrementChallengeAttempt: vi.fn(async () => undefined),
    upgradeCustomerSession: vi.fn(async () => ({
      status: "COMPLETED" as const,
      session: completedSession("user-1"),
    })),
    completeAdminRecentAuth: vi.fn(async () => ({
      status: "COMPLETED" as const,
      session: completedSession("user-1"),
    })),
  };
  const passwordVerifier: IdentityPasswordVerifier = {
    verify: vi.fn(async () => true),
  };
  const proofProvider: IdentityEmailMfaProofProvider = {
    hashChallengeToken: vi.fn(() => "challenge-token-hash"),
    verifyEmailCode: vi.fn((_hash, candidate) => candidate === "123456"),
    hashRecoveryCode: vi.fn((candidate) => `recovery:${candidate}`),
  };
  return {
    repository,
    sessionValidation,
    passwordVerifier,
    proofProvider,
    capability: createIdentityRecentAuthCompletionCapability(
      repository,
      sessionValidation,
      passwordVerifier,
      proofProvider,
      () => now,
    ),
  };
}

describe("Identity recent-auth completion", () => {
  it("upgrades a CUSTOMER session using password only", async () => {
    const h = createHarness("CUSTOMER");
    const result = await h.capability.complete({
      sessionToken: "session-token",
      password: "correct",
    });
    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.verificationMethod).toBe("PASSWORD");
      expect(result.session.assuranceLevel).toBe("RECENTLY_AUTHENTICATED");
      expect(result.session.recentAuthenticatedAt).toEqual(now);
    }
    expect(h.repository.upgradeCustomerSession).toHaveBeenCalledWith({
      sessionId: "session-user-1",
      userId: "user-1",
      completedAt: now,
    });
    expect(h.repository.findRecentAuthChallenge).not.toHaveBeenCalled();
  });

  it("requires ADMIN RECENT_AUTH MFA proof", async () => {
    const h = createHarness("ADMIN");
    await expect(
      h.capability.complete({ sessionToken: "session-token", password: "correct" }),
    ).resolves.toEqual({ status: "INVALID", code: "MFA_REQUIRED" });
    expect(h.repository.completeAdminRecentAuth).not.toHaveBeenCalled();
  });

  it("atomically completes ADMIN email OTP recent-auth", async () => {
    const h = createHarness("ADMIN");
    const result = await h.capability.complete({
      sessionToken: "session-token",
      password: "correct",
      challengeToken: "challenge-token",
      code: "123456",
    });
    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.verificationMethod).toBe("PASSWORD_EMAIL_OTP");
    }
    expect(h.repository.completeAdminRecentAuth).toHaveBeenCalledWith({
      sessionId: "session-user-1",
      userId: "user-1",
      challengeId: "challenge-1",
      recoveryCodeId: null,
      completedAt: now,
    });
  });

  it("supports ADMIN recovery proof", async () => {
    const h = createHarness("ADMIN");
    vi.mocked(h.repository.findUnusedRecoveryCode).mockResolvedValue({ id: "recovery-1" });
    const result = await h.capability.complete({
      sessionToken: "session-token",
      password: "correct",
      challengeToken: "challenge-token",
      code: "ABCDE-FGHIJ",
    });
    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.verificationMethod).toBe("PASSWORD_RECOVERY");
    }
    expect(h.repository.completeAdminRecentAuth).toHaveBeenCalledWith(
      expect.objectContaining({ recoveryCodeId: "recovery-1" }),
    );
  });

  it("increments attempts on bad ADMIN MFA code without committing", async () => {
    const h = createHarness("ADMIN");
    const result = await h.capability.complete({
      sessionToken: "session-token",
      password: "correct",
      challengeToken: "challenge-token",
      code: "000000",
    });
    expect(result).toEqual({ status: "INVALID", code: "INVALID_CODE" });
    expect(h.repository.incrementChallengeAttempt).toHaveBeenCalledWith("challenge-1");
    expect(h.repository.completeAdminRecentAuth).not.toHaveBeenCalled();
  });

  it("rejects invalid password before touching MFA state", async () => {
    const h = createHarness("ADMIN");
    vi.mocked(h.passwordVerifier.verify).mockResolvedValue(false);
    const result = await h.capability.complete({
      sessionToken: "session-token",
      password: "wrong",
      challengeToken: "challenge-token",
      code: "123456",
    });
    expect(result).toEqual({ status: "INVALID", code: "INVALID_CREDENTIALS" });
    expect(h.repository.findRecentAuthChallenge).not.toHaveBeenCalled();
  });

  it("rejects a non-RECENT_AUTH challenge", async () => {
    const h = createHarness("ADMIN");
    vi.mocked(h.repository.findRecentAuthChallenge).mockResolvedValue({
      id: "challenge-login",
      userId: "user-1",
      purpose: "LOGIN",
      codeHash: "email-code-hash",
      expiresAt: new Date(now.getTime() + 60_000),
      consumedAt: null,
      attemptCount: 0,
    });
    const result = await h.capability.complete({
      sessionToken: "session-token",
      password: "correct",
      challengeToken: "challenge-token",
      code: "123456",
    });
    expect(result).toEqual({ status: "INVALID", code: "INVALID_CHALLENGE" });
    expect(h.repository.completeAdminRecentAuth).not.toHaveBeenCalled();
  });

  it("fails closed when the session becomes invalid at commit time", async () => {
    const h = createHarness("ADMIN");
    vi.mocked(h.repository.completeAdminRecentAuth).mockResolvedValue({
      status: "SESSION_REJECTED",
    });
    const result = await h.capability.complete({
      sessionToken: "session-token",
      password: "correct",
      challengeToken: "challenge-token",
      code: "123456",
    });
    expect(result).toEqual({ status: "INVALID", code: "INVALID_SESSION" });
  });
});
