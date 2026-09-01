import { describe, expect, it, vi } from "vitest";
import { createIdentityMfaRecoveryRegenerationCapability } from "../logic/mfa-recovery-regeneration";
import type { IdentityMfaRecoveryRegenerationRepository } from "../logic/mfa-recovery-regeneration-repository";
import type { IdentityMfaRecoveryCodeProvider } from "../logic/mfa-recovery-code-provider";
import type { IdentitySessionValidationCapability } from "../contracts/session-validation.contract";

const now = new Date("2026-09-01T08:40:00.000Z");

function validSession(options?: {
  role?: "CUSTOMER" | "ADMIN";
  recentAuthenticatedAt?: Date | null;
  mfaVerifiedAt?: Date | null;
  administratorMfaEnabled?: boolean;
}) {
  const role = options?.role ?? "ADMIN";
  return {
    status: "VALID" as const,
    context: {
      session: {
        id: "session-1",
        userId: "admin-1",
        expiresAt: new Date(now.getTime() + 60_000),
        lastAuthenticatedAt: now,
        mfaVerifiedAt:
          options?.mfaVerifiedAt === undefined ? now : options.mfaVerifiedAt,
        recentAuthenticatedAt:
          options?.recentAuthenticatedAt === undefined
            ? now
            : options.recentAuthenticatedAt,
        lastSeenAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 60_000),
        authenticationMethod: "PASSWORD_EMAIL_OTP" as const,
        assuranceLevel: "RECENTLY_AUTHENTICATED" as const,
        createdAt: now,
      },
      principal: {
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        emailVerified: now,
        role,
        suspendedAt: null,
        lifecycleState: "ACTIVE" as const,
      },
      administratorMfaEnabled:
        options?.administratorMfaEnabled === undefined
          ? true
          : options.administratorMfaEnabled,
    },
  };
}

function harness(
  sessionResult: Awaited<ReturnType<IdentitySessionValidationCapability["validate"]>> = validSession(),
) {
  const repository: IdentityMfaRecoveryRegenerationRepository = {
    regenerate: vi.fn(async () => undefined),
  };
  const sessionValidation: IdentitySessionValidationCapability = {
    validate: vi.fn(async () => sessionResult),
  };
  const recoveryCodeProvider: IdentityMfaRecoveryCodeProvider = {
    issue: vi.fn(() =>
      Array.from({ length: 10 }, (_, index) => ({
        value: `CODE${index}-ABCDE`,
        hash: `hash-${index}`,
      })),
    ),
  };
  return {
    repository,
    sessionValidation,
    recoveryCodeProvider,
    capability: createIdentityMfaRecoveryRegenerationCapability(
      repository,
      sessionValidation,
      recoveryCodeProvider,
      () => now,
    ),
  };
}

describe("Identity MFA recovery regeneration", () => {
  it("replaces 10 recovery hashes for a recent MFA-verified admin", async () => {
    const h = harness();
    const result = await h.capability.regenerate({ sessionToken: "session-token" });
    expect(result).toMatchObject({
      status: "REGENERATED",
      userId: "admin-1",
      replacementAuthenticationMethod: "PASSWORD_EMAIL_OTP",
    });
    if (result.status !== "REGENERATED") throw new Error("Expected regeneration");
    expect(result.recoveryCodes).toHaveLength(10);
    expect(h.recoveryCodeProvider.issue).toHaveBeenCalledWith(10);
    expect(h.repository.regenerate).toHaveBeenCalledWith({
      userId: "admin-1",
      recoveryCodeHashes: Array.from({ length: 10 }, (_, index) => `hash-${index}`),
      regeneratedAt: now,
    });
  });

  it("requires a valid recent session before authorization checks", async () => {
    const invalid = harness({ status: "INVALID", code: "SESSION_NOT_FOUND" });
    await expect(
      invalid.capability.regenerate({ sessionToken: "bad" }),
    ).resolves.toEqual({ status: "INVALID", code: "INVALID_SESSION" });

    const stale = harness(
      validSession({
        recentAuthenticatedAt: new Date(now.getTime() - 15 * 60_000 - 1),
      }),
    );
    await expect(
      stale.capability.regenerate({ sessionToken: "session-token" }),
    ).resolves.toEqual({ status: "INVALID", code: "RECENT_AUTH_REQUIRED" });

    const boundary = harness(
      validSession({
        recentAuthenticatedAt: new Date(now.getTime() - 15 * 60_000),
      }),
    );
    await expect(
      boundary.capability.regenerate({ sessionToken: "session-token" }),
    ).resolves.toMatchObject({ status: "REGENERATED" });
  });

  it("requires ADMIN role, MFA proof, and enabled MFA", async () => {
    for (const session of [
      validSession({ role: "CUSTOMER" }),
      validSession({ mfaVerifiedAt: null }),
      validSession({ administratorMfaEnabled: false }),
    ]) {
      const h = harness(session);
      await expect(
        h.capability.regenerate({ sessionToken: "session-token" }),
      ).resolves.toEqual({ status: "INVALID", code: "FORBIDDEN" });
      expect(h.recoveryCodeProvider.issue).not.toHaveBeenCalled();
      expect(h.repository.regenerate).not.toHaveBeenCalled();
    }
  });

  it("returns typed session, code-provider, and persistence failures", async () => {
    const sessionFailure = harness({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
    await expect(
      sessionFailure.capability.regenerate({ sessionToken: "session-token" }),
    ).resolves.toEqual({
      status: "FAILED",
      code: "SESSION_PROVIDER_UNAVAILABLE",
    });

    const providerFailure = harness();
    vi.mocked(providerFailure.recoveryCodeProvider.issue).mockImplementation(() => {
      throw new Error("provider unavailable");
    });
    await expect(
      providerFailure.capability.regenerate({ sessionToken: "session-token" }),
    ).resolves.toEqual({ status: "FAILED", code: "CODE_PROVIDER_UNAVAILABLE" });

    const persistenceFailure = harness();
    vi.mocked(persistenceFailure.repository.regenerate).mockRejectedValue(
      new Error("postgres unavailable"),
    );
    await expect(
      persistenceFailure.capability.regenerate({ sessionToken: "session-token" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
