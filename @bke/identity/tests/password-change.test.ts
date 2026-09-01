import { describe, expect, it, vi } from "vitest";
import { createIdentityPasswordChangeCapability } from "../logic/password-change";
import type { IdentityPasswordChangeRepository } from "../logic/password-change-repository";
import type { IdentityPasswordHasher } from "../logic/password-hasher";
import type { IdentityPasswordVerifier } from "../logic/password-verifier";
import type { IdentitySessionValidationCapability } from "../contracts/session-validation.contract";

const now = new Date("2026-09-01T08:00:00.000Z");

function validSession(
  role: "CUSTOMER" | "ADMIN" = "CUSTOMER",
  recentAuthenticatedAt: Date | null = now,
) {
  return {
    status: "VALID" as const,
    context: {
      session: {
        id: "session-1",
        userId: "user-1",
        expiresAt: new Date(now.getTime() + 60_000),
        lastAuthenticatedAt: now,
        mfaVerifiedAt: role === "ADMIN" ? now : null,
        recentAuthenticatedAt,
        lastSeenAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 60_000),
        authenticationMethod: role === "ADMIN" ? ("PASSWORD_EMAIL_OTP" as const) : ("PASSWORD" as const),
        assuranceLevel: "RECENTLY_AUTHENTICATED" as const,
        createdAt: new Date(now.getTime() - 60_000),
      },
      principal: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        emailVerified: now,
        role,
        suspendedAt: null,
        lifecycleState: "ACTIVE" as const,
      },
      administratorMfaEnabled: role === "ADMIN",
    },
  };
}

function harness(
  sessionResult: Awaited<ReturnType<IdentitySessionValidationCapability["validate"]>> = validSession(),
) {
  const repository: IdentityPasswordChangeRepository = {
    findCredentialByUserId: vi.fn(async () => ({ passwordHash: "old-hash" })),
    changePassword: vi.fn(async () => undefined),
  };
  const sessionValidation: IdentitySessionValidationCapability = {
    validate: vi.fn(async () => sessionResult),
  };
  const passwordVerifier: IdentityPasswordVerifier = {
    verify: vi.fn(async () => true),
  };
  const passwordHasher: IdentityPasswordHasher = {
    hash: vi.fn(async () => "new-hash"),
  };

  return {
    repository,
    sessionValidation,
    passwordVerifier,
    passwordHasher,
    capability: createIdentityPasswordChangeCapability(
      repository,
      sessionValidation,
      passwordVerifier,
      passwordHasher,
      () => now,
    ),
  };
}

describe("Identity password change", () => {
  it("changes a customer password after recent auth and returns V1 replacement-session policy", async () => {
    const h = harness();
    const result = await h.capability.change({
      sessionToken: "session-token",
      currentPassword: "CurrentPassword1",
      newPassword: "NewPassword123",
    });

    expect(result).toEqual({
      status: "CHANGED",
      userId: "user-1",
      role: "CUSTOMER",
      replacementAuthenticationMethod: "PASSWORD",
    });
    expect(h.repository.changePassword).toHaveBeenCalledWith({
      userId: "user-1",
      passwordHash: "new-hash",
      changedAt: now,
    });
  });

  it("returns the ADMIN replacement-session method used by V1", async () => {
    const h = harness(validSession("ADMIN"));
    await expect(
      h.capability.change({
        sessionToken: "session-token",
        currentPassword: "CurrentPassword1",
        newPassword: "NewPassword123",
      }),
    ).resolves.toMatchObject({
      status: "CHANGED",
      role: "ADMIN",
      replacementAuthenticationMethod: "PASSWORD_EMAIL_OTP",
    });
  });

  it("requires a valid recently authenticated session before password input", async () => {
    const invalid = harness({ status: "INVALID", code: "SESSION_NOT_FOUND" });
    await expect(
      invalid.capability.change({
        sessionToken: "bad",
        currentPassword: "",
        newPassword: "bad",
      }),
    ).resolves.toEqual({ status: "INVALID", code: "INVALID_SESSION" });

    const stale = harness(
      validSession(
        "CUSTOMER",
        new Date(now.getTime() - 15 * 60_000 - 1),
      ),
    );
    await expect(
      stale.capability.change({
        sessionToken: "session-token",
        currentPassword: "CurrentPassword1",
        newPassword: "NewPassword123",
      }),
    ).resolves.toEqual({ status: "INVALID", code: "RECENT_AUTH_REQUIRED" });

    const boundary = harness(
      validSession("CUSTOMER", new Date(now.getTime() - 15 * 60_000)),
    );
    await expect(
      boundary.capability.change({
        sessionToken: "session-token",
        currentPassword: "CurrentPassword1",
        newPassword: "NewPassword123",
      }),
    ).resolves.toMatchObject({ status: "CHANGED" });
  });

  it("enforces V1 current/new password validation exactly", async () => {
    const emptyCurrent = harness();
    await expect(
      emptyCurrent.capability.change({
        sessionToken: "session-token",
        currentPassword: "",
        newPassword: "NewPassword123",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });

    for (const newPassword of [
      "Short1Aa",
      "alllowercase123",
      "ALLUPPERCASE123",
      "NoDigitsPassword",
    ]) {
      const h = harness();
      await expect(
        h.capability.change({
          sessionToken: "session-token",
          currentPassword: "CurrentPassword1",
          newPassword,
        }),
      ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    }
  });

  it("collapses missing credential and bad current password into INVALID_CREDENTIALS", async () => {
    const missing = harness();
    vi.mocked(missing.repository.findCredentialByUserId).mockResolvedValue(null);
    await expect(
      missing.capability.change({
        sessionToken: "session-token",
        currentPassword: "CurrentPassword1",
        newPassword: "NewPassword123",
      }),
    ).resolves.toEqual({ status: "INVALID", code: "INVALID_CREDENTIALS" });

    const bad = harness();
    vi.mocked(bad.passwordVerifier.verify).mockResolvedValue(false);
    await expect(
      bad.capability.change({
        sessionToken: "session-token",
        currentPassword: "WrongPassword1",
        newPassword: "NewPassword123",
      }),
    ).resolves.toEqual({ status: "INVALID", code: "INVALID_CREDENTIALS" });
  });

  it("returns typed session, password-provider, and persistence failures", async () => {
    const sessionFailure = harness({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
    await expect(
      sessionFailure.capability.change({
        sessionToken: "session-token",
        currentPassword: "CurrentPassword1",
        newPassword: "NewPassword123",
      }),
    ).resolves.toEqual({
      status: "FAILED",
      code: "SESSION_PROVIDER_UNAVAILABLE",
    });

    const hashFailure = harness();
    vi.mocked(hashFailure.passwordHasher.hash).mockRejectedValue(
      new Error("argon2 unavailable"),
    );
    await expect(
      hashFailure.capability.change({
        sessionToken: "session-token",
        currentPassword: "CurrentPassword1",
        newPassword: "NewPassword123",
      }),
    ).resolves.toEqual({
      status: "FAILED",
      code: "PASSWORD_PROVIDER_UNAVAILABLE",
    });

    const persistenceFailure = harness();
    vi.mocked(persistenceFailure.repository.changePassword).mockRejectedValue(
      new Error("postgres unavailable"),
    );
    await expect(
      persistenceFailure.capability.change({
        sessionToken: "session-token",
        currentPassword: "CurrentPassword1",
        newPassword: "NewPassword123",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
