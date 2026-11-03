import { describe, expect, it, vi } from "vitest";
import type { IdentityIssuedSession } from "../contracts/session.contract";
import type { IdentitySessionValidationCapability } from "../contracts/session-validation.contract";
import type { IdentityEmailMfaProofProvider } from "../logic/email-mfa-proof-provider";
import type { IdentityPasswordVerifier } from "../logic/password-verifier";
import { createIdentityRecentAuthCompletionCapability } from "../logic/recent-auth-completion";
import type { IdentityRecentAuthCompletionRepository } from "../logic/recent-auth-completion-repository";

const now = new Date("2026-08-31T04:00:00.000Z");

function session(
  userId: string,
  authenticationMethod: IdentityIssuedSession["authenticationMethod"] = "PASSWORD_EMAIL_OTP",
  mfaEnabled = true,
): IdentityIssuedSession {
  return {
    id: `session-${userId}`,
    userId,
    expiresAt: new Date(now.getTime() + 60_000),
    lastAuthenticatedAt: new Date(now.getTime() - 60_000),
    mfaVerifiedAt: mfaEnabled ? new Date(now.getTime() - 30_000) : null,
    recentAuthenticatedAt: null,
    lastSeenAt: now,
    absoluteExpiresAt: new Date(now.getTime() + 120_000),
    authenticationMethod,
    assuranceLevel: mfaEnabled ? "MFA_VERIFIED" : "BASIC",
    createdAt: new Date(now.getTime() - 120_000),
  };
}

function completedSession(
  userId: string,
  authenticationMethod: IdentityIssuedSession["authenticationMethod"],
  mfaEnabled: boolean,
): IdentityIssuedSession {
  return {
    ...session(userId, authenticationMethod, mfaEnabled),
    recentAuthenticatedAt: now,
    assuranceLevel: "RECENTLY_AUTHENTICATED",
  };
}

function createHarness(
  role: "CUSTOMER" | "ADMIN" = "ADMIN",
  mfaEnabled = role === "ADMIN",
  authenticationMethod: IdentityIssuedSession["authenticationMethod"] =
    mfaEnabled ? "PASSWORD_EMAIL_OTP" : "PASSWORD",
) {
  const issued = session("user-1", authenticationMethod, mfaEnabled);
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
          establishedAt: new Date("2026-01-01T00:00:00.000Z"),
          suspendedAt: null,
          lifecycleState: "ACTIVE" as const,
        },
        mfaEnabled,
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
      sessionId: authenticationMethod.startsWith("GOOGLE_OIDC") ? "session-user-1" : null,
      primaryAuthenticationMethod: authenticationMethod.startsWith("GOOGLE_OIDC")
        ? "GOOGLE_OIDC" as const
        : "PASSWORD" as const,
    })),
    findUnusedRecoveryCode: vi.fn(async () => null),
    incrementChallengeAttempt: vi.fn(async () => undefined),
    upgradePasswordOnlyCustomerSession: vi.fn(async () => ({ status: "COMPLETED" as const, session: completedSession("user-1", authenticationMethod, mfaEnabled) })),
    completeMfaRecentAuth: vi.fn(async () => ({
      status: "COMPLETED" as const,
      session: completedSession("user-1", authenticationMethod, mfaEnabled),
    })),
  };
  const passwordVerifier: IdentityPasswordVerifier = { verify: vi.fn(async () => true) };
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
    capability: createIdentityRecentAuthCompletionCapability(repository, sessionValidation, passwordVerifier, proofProvider, () => now),
  };
}

describe("Identity recent-auth completion", () => {
  it("uses a Google session's local email factor as recent-auth without enrolling MFA", async () => {
    const h = createHarness("CUSTOMER", false, "GOOGLE_OIDC");
    const result = await h.capability.complete({
      sessionToken: "session-token",
      challengeToken: "challenge-token",
      code: "123456",
    });

    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.verificationMethod).toBe("GOOGLE_OIDC_EMAIL_OTP");
      expect(result.session.recentAuthenticatedAt).toEqual(now);
      expect(result.session.mfaVerifiedAt).toBeNull();
    }
    expect(h.repository.findPasswordRecord).not.toHaveBeenCalled();
    expect(h.repository.findUnusedRecoveryCode).not.toHaveBeenCalled();
    expect(h.repository.completeMfaRecentAuth).toHaveBeenCalledWith({
      sessionId: "session-user-1",
      userId: "user-1",
      challengeId: "challenge-1",
      recoveryCodeId: null,
      completedAt: now,
      authenticationMethod: "GOOGLE_OIDC_EMAIL_OTP",
    });
  });

  it("allows a verified-contact Google ADMIN app factor to reach enrollment without claiming MFA", async () => {
    const h = createHarness("ADMIN", false, "GOOGLE_OIDC");
    const result = await h.capability.complete({
      sessionToken: "session-token",
      challengeToken: "challenge-token",
      code: "123456",
    });
    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.verificationMethod).toBe("GOOGLE_OIDC_EMAIL_OTP");
      expect(result.session.recentAuthenticatedAt).toEqual(now);
      expect(result.session.mfaVerifiedAt).toBeNull();
    }
    expect(h.repository.findUnusedRecoveryCode).not.toHaveBeenCalled();
  });

  it("requires an app-factor challenge for Google sessions and preserves enrolled recovery semantics", async () => {
    const h = createHarness("ADMIN", true, "GOOGLE_OIDC");
    vi.mocked(h.repository.findUnusedRecoveryCode).mockResolvedValue({ id: "recovery-1" });
    const result = await h.capability.complete({
      sessionToken: "session-token",
      challengeToken: "challenge-token",
      code: "ABCDE-FGHIJ",
    });
    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.verificationMethod).toBe("GOOGLE_OIDC_RECOVERY");
      expect(result.session.mfaVerifiedAt).not.toBeNull();
    }
  });

  it("rejects a Google challenge bound to another session and mixed password inputs", async () => {
    const h = createHarness("CUSTOMER", false, "GOOGLE_OIDC");
    vi.mocked(h.repository.findRecentAuthChallenge).mockResolvedValue({
      id: "challenge-other-session",
      userId: "user-1",
      purpose: "RECENT_AUTH",
      codeHash: "email-code-hash",
      expiresAt: new Date(now.getTime() + 60_000),
      consumedAt: null,
      attemptCount: 0,
      sessionId: "different-session",
      primaryAuthenticationMethod: "GOOGLE_OIDC",
    });
    await expect(h.capability.complete({
      sessionToken: "session-token",
      challengeToken: "challenge-token",
      code: "123456",
    })).resolves.toEqual({ status: "INVALID", code: "INVALID_CHALLENGE" });
    await expect(h.capability.complete({
      sessionToken: "session-token",
      password: "must-not-be-used",
      challengeToken: "challenge-token",
      code: "123456",
    })).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
  });

  it("upgrades a CUSTOMER session using password only", async () => {
    const h = createHarness("CUSTOMER", false);
    const result = await h.capability.complete({ sessionToken: "session-token", password: "correct" });
    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.verificationMethod).toBe("PASSWORD");
      expect(result.session.assuranceLevel).toBe("RECENTLY_AUTHENTICATED");
      expect(result.session.recentAuthenticatedAt).toEqual(now);
    }
    expect(h.repository.upgradePasswordOnlyCustomerSession).toHaveBeenCalledWith({ sessionId: "session-user-1", userId: "user-1", completedAt: now });
    expect(h.repository.findRecentAuthChallenge).not.toHaveBeenCalled();
  });

  it("requires MFA proof for an MFA-enabled customer", async () => {
    const h = createHarness("CUSTOMER", true);
    await expect(
      h.capability.complete({
        sessionToken: "session-token",
        password: "correct",
      }),
    ).resolves.toEqual({ status: "INVALID", code: "MFA_REQUIRED" });

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
    expect(h.repository.completeMfaRecentAuth).toHaveBeenCalled();
    expect(h.repository.upgradePasswordOnlyCustomerSession).not.toHaveBeenCalled();
  });

  it("requires ADMIN RECENT_AUTH MFA proof", async () => {
    const h = createHarness("ADMIN");
    await expect(h.capability.complete({ sessionToken: "session-token", password: "correct" })).resolves.toEqual({ status: "INVALID", code: "MFA_REQUIRED" });
    expect(h.repository.completeMfaRecentAuth).not.toHaveBeenCalled();
  });

  it("atomically completes ADMIN email OTP recent-auth", async () => {
    const h = createHarness("ADMIN");
    const result = await h.capability.complete({ sessionToken: "session-token", password: "correct", challengeToken: "challenge-token", code: "123456" });
    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") expect(result.verificationMethod).toBe("PASSWORD_EMAIL_OTP");
    expect(h.repository.completeMfaRecentAuth).toHaveBeenCalledWith({
      sessionId: "session-user-1",
      userId: "user-1",
      challengeId: "challenge-1",
      recoveryCodeId: null,
      completedAt: now,
      authenticationMethod: "PASSWORD_EMAIL_OTP",
    });
  });

  it("supports ADMIN recovery proof", async () => {
    const h = createHarness("ADMIN");
    vi.mocked(h.repository.findUnusedRecoveryCode).mockResolvedValue({ id: "recovery-1" });
    const result = await h.capability.complete({ sessionToken: "session-token", password: "correct", challengeToken: "challenge-token", code: "ABCDE-FGHIJ" });
    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") expect(result.verificationMethod).toBe("PASSWORD_RECOVERY");
    expect(h.repository.completeMfaRecentAuth).toHaveBeenCalledWith(expect.objectContaining({ recoveryCodeId: "recovery-1" }));
  });

  it("increments attempts on bad ADMIN MFA code without committing", async () => {
    const h = createHarness("ADMIN");
    const result = await h.capability.complete({ sessionToken: "session-token", password: "correct", challengeToken: "challenge-token", code: "000000" });
    expect(result).toEqual({ status: "INVALID", code: "INVALID_CODE" });
    expect(h.repository.incrementChallengeAttempt).toHaveBeenCalledWith("challenge-1");
    expect(h.repository.completeMfaRecentAuth).not.toHaveBeenCalled();
  });

  it("rejects invalid password before touching MFA state", async () => {
    const h = createHarness("ADMIN");
    vi.mocked(h.passwordVerifier.verify).mockResolvedValue(false);
    const result = await h.capability.complete({ sessionToken: "session-token", password: "wrong", challengeToken: "challenge-token", code: "123456" });
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
      sessionId: null,
      primaryAuthenticationMethod: "PASSWORD",
    });
    const result = await h.capability.complete({ sessionToken: "session-token", password: "correct", challengeToken: "challenge-token", code: "123456" });
    expect(result).toEqual({ status: "INVALID", code: "INVALID_CHALLENGE" });
    expect(h.repository.completeMfaRecentAuth).not.toHaveBeenCalled();
  });

  it("fails closed when the session becomes invalid at commit time", async () => {
    const h = createHarness("ADMIN");
    vi.mocked(h.repository.completeMfaRecentAuth).mockResolvedValue({ status: "SESSION_REJECTED" });
    const result = await h.capability.complete({ sessionToken: "session-token", password: "correct", challengeToken: "challenge-token", code: "123456" });
    expect(result).toEqual({ status: "INVALID", code: "INVALID_SESSION" });
  });
});
