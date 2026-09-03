import { describe, expect, it, vi } from "vitest";
import type { IdentitySessionValidationCapability } from "../contracts/session-validation.contract";
import { createIdentityMfaEmergencyEnrollmentCapability } from "../logic/mfa-emergency-enrollment";
import type { IdentityMfaEmergencyEnrollmentRepository } from "../logic/mfa-emergency-enrollment-repository";
import type { IdentityMfaRecoveryCodeProvider } from "../logic/mfa-recovery-code-provider";
import type { IdentitySessionTokenProvider } from "../logic/session-token-provider";

const now = new Date("2026-09-01T10:00:00.000Z");
const emergencyToken = "E".repeat(43);

function validSession(options?: {
  role?: "CUSTOMER" | "ADMIN";
  recentAuthenticatedAt?: Date | null;
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
        mfaVerifiedAt: null,
        recentAuthenticatedAt:
          options?.recentAuthenticatedAt === undefined ? now : options.recentAuthenticatedAt,
        lastSeenAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 60_000),
        authenticationMethod: "PASSWORD" as const,
        assuranceLevel: "RECENTLY_AUTHENTICATED" as const,
        createdAt: now,
      },
      principal: {
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        emailVerified: null,
        role,
        establishedAt: new Date("2026-01-01T00:00:00.000Z"),
        suspendedAt: null,
        lifecycleState: "ACTIVE" as const,
      },
      administratorMfaEnabled: false,
    },
  };
}

function harness(
  sessionResult: Awaited<ReturnType<IdentitySessionValidationCapability["validate"]>> = validSession(),
) {
  const repository: IdentityMfaEmergencyEnrollmentRepository = {
    enroll: vi.fn(async () => ({
      status: "ENROLLED" as const,
      authorizationId: "authorization-1",
      ownerKeyVersion: 7,
      deploymentEnvironment: "production",
    })),
  };
  const sessionValidation: IdentitySessionValidationCapability = {
    validate: vi.fn(async () => sessionResult),
  };
  const sessionTokenProvider: IdentitySessionTokenProvider = {
    hash: vi.fn(() => "emergency-token-hash"),
    issue: vi.fn(() => ({
      sessionId: "replacement-session",
      token: "replacement-session-token",
      tokenHash: "replacement-session-hash",
    })),
  };
  const recoveryCodeProvider: IdentityMfaRecoveryCodeProvider = {
    issue: vi.fn(() =>
      Array.from({ length: 10 }, (_, index) => ({
        value: `RECOVERY-${index}`,
        hash: `recovery-hash-${index}`,
      })),
    ),
  };

  return {
    repository,
    sessionValidation,
    sessionTokenProvider,
    recoveryCodeProvider,
    capability: createIdentityMfaEmergencyEnrollmentCapability(
      repository,
      sessionValidation,
      sessionTokenProvider,
      recoveryCodeProvider,
      () => now,
    ),
  };
}

describe("Identity emergency MFA enrollment", () => {
  it("allows a recent admin enrollment session without existing MFA", async () => {
    const h = harness();
    const result = await h.capability.enroll({
      sessionToken: "current-session",
      emergencyToken,
    });

    expect(result).toEqual({
      status: "ENROLLED",
      userId: "admin-1",
      recoveryCodes: Array.from({ length: 10 }, (_, index) => `RECOVERY-${index}`),
      replacementSessionToken: "replacement-session-token",
      auditContext: {
        authorizationId: "authorization-1",
        ownerKeyVersion: 7,
        deploymentEnvironment: "production",
      },
    });
    expect(h.repository.enroll).toHaveBeenCalledWith({
      userId: "admin-1",
      emergencyTokenHash: "emergency-token-hash",
      recoveryCodeHashes: Array.from({ length: 10 }, (_, index) => `recovery-hash-${index}`),
      replacementSession: {
        sessionId: "replacement-session",
        token: "replacement-session-token",
        tokenHash: "replacement-session-hash",
      },
      enrolledAt: now,
      replacementSessionExpiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    });
  });

  it("requires a valid recent ADMIN session but not pre-existing MFA", async () => {
    const invalid = harness({ status: "INVALID", code: "SESSION_NOT_FOUND" });
    await expect(invalid.capability.enroll({ sessionToken: "bad", emergencyToken })).resolves.toEqual({ status: "INVALID", code: "INVALID_SESSION" });

    const customer = harness(validSession({ role: "CUSTOMER" }));
    await expect(customer.capability.enroll({ sessionToken: "current", emergencyToken })).resolves.toEqual({ status: "INVALID", code: "FORBIDDEN" });

    const stale = harness(validSession({ recentAuthenticatedAt: new Date(now.getTime() - 15 * 60_000 - 1) }));
    await expect(stale.capability.enroll({ sessionToken: "current", emergencyToken })).resolves.toEqual({ status: "INVALID", code: "RECENT_AUTH_REQUIRED" });

    const boundary = harness(validSession({ recentAuthenticatedAt: new Date(now.getTime() - 15 * 60_000) }));
    await expect(boundary.capability.enroll({ sessionToken: "current", emergencyToken })).resolves.toMatchObject({ status: "ENROLLED" });
  });

  it("enforces the V1 emergency-token length before hashing or persistence", async () => {
    for (const token of ["x".repeat(39), "x".repeat(257)]) {
      const h = harness();
      await expect(h.capability.enroll({ sessionToken: "current", emergencyToken: token })).resolves.toEqual({ status: "INVALID", code: "INVALID_EMERGENCY_ENROLLMENT" });
      expect(h.sessionTokenProvider.hash).not.toHaveBeenCalled();
      expect(h.repository.enroll).not.toHaveBeenCalled();
    }
  });

  it("returns typed invalid authorization and provider/persistence failures", async () => {
    const invalidAuthorization = harness();
    vi.mocked(invalidAuthorization.repository.enroll).mockResolvedValue({ status: "INVALID_AUTHORIZATION" });
    await expect(invalidAuthorization.capability.enroll({ sessionToken: "current", emergencyToken })).resolves.toEqual({ status: "INVALID", code: "INVALID_EMERGENCY_ENROLLMENT" });

    const tokenFailure = harness();
    vi.mocked(tokenFailure.sessionTokenProvider.hash).mockImplementation(() => { throw new Error("token provider unavailable"); });
    await expect(tokenFailure.capability.enroll({ sessionToken: "current", emergencyToken })).resolves.toEqual({ status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" });

    const codeFailure = harness();
    vi.mocked(codeFailure.recoveryCodeProvider.issue).mockImplementation(() => { throw new Error("code provider unavailable"); });
    await expect(codeFailure.capability.enroll({ sessionToken: "current", emergencyToken })).resolves.toEqual({ status: "FAILED", code: "CODE_PROVIDER_UNAVAILABLE" });

    const persistenceFailure = harness();
    vi.mocked(persistenceFailure.repository.enroll).mockRejectedValue(new Error("postgres unavailable"));
    await expect(persistenceFailure.capability.enroll({ sessionToken: "current", emergencyToken })).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
