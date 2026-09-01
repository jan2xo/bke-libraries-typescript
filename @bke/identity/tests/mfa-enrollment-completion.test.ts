import { describe, expect, it, vi } from "vitest";
import { createIdentityMfaEnrollmentCompletionCapability } from "../logic/mfa-enrollment-completion";
import type { IdentityEmailMfaProofProvider } from "../logic/email-mfa-proof-provider";
import type {
  IdentityMfaEnrollmentChallengeRecord,
  IdentityMfaEnrollmentCompletionRepository,
} from "../logic/mfa-enrollment-completion-repository";
import type { IdentityMfaRecoveryCodeProvider } from "../logic/mfa-recovery-code-provider";

const now = new Date("2026-08-31T06:00:00.000Z");

function challenge(
  overrides: Partial<IdentityMfaEnrollmentChallengeRecord> = {},
): IdentityMfaEnrollmentChallengeRecord {
  return {
    id: "challenge-1",
    userId: "admin-1",
    purpose: "ENROLLMENT",
    codeHash: "email-code-hash",
    expiresAt: new Date("2026-08-31T06:10:00.000Z"),
    consumedAt: null,
    attemptCount: 0,
    userRole: "ADMIN",
    mfaMethodId: "mfa-method-1",
    mfaEnabledAt: null,
    pendingExpiresAt: new Date("2026-08-31T06:10:00.000Z"),
    ...overrides,
  };
}

function proofProvider(
  overrides: Partial<IdentityEmailMfaProofProvider> = {},
): IdentityEmailMfaProofProvider {
  return {
    hashChallengeToken: vi.fn(() => "challenge-token-hash"),
    verifyEmailCode: vi.fn((_hash, candidate) => candidate === "123456"),
    hashRecoveryCode: vi.fn((candidate) => `recovery:${candidate}`),
    ...overrides,
  };
}

function recoveryProvider(
  overrides: Partial<IdentityMfaRecoveryCodeProvider> = {},
): IdentityMfaRecoveryCodeProvider {
  return {
    issue: vi.fn(() =>
      Array.from({ length: 10 }, (_, index) => ({
        value: `RAW-${index}`,
        hash: `HASH-${index}`,
      })),
    ),
    ...overrides,
  };
}

function repository(
  overrides: Partial<IdentityMfaEnrollmentCompletionRepository> = {},
): IdentityMfaEnrollmentCompletionRepository {
  return {
    findEnrollmentChallenge: vi.fn(async () => challenge()),
    findUnusedRecoveryCode: vi.fn(async (_userId, codeHash) =>
      codeHash === "recovery:RECOVERY-CODE" ? { id: "old-recovery-1" } : null,
    ),
    incrementChallengeAttempt: vi.fn(async () => undefined),
    completeEnrollment: vi.fn(async () => "COMPLETED" as const),
    ...overrides,
  };
}

describe("Identity MFA enrollment completion", () => {
  it("completes email-OTP enrollment and returns raw replacement recovery codes only after commit", async () => {
    const repo = repository();
    const recovery = recoveryProvider();
    const capability = createIdentityMfaEnrollmentCompletionCapability(
      repo,
      proofProvider(),
      recovery,
      () => now,
    );

    const result = await capability.complete({
      userId: " admin-1 ",
      challengeToken: " challenge-token ",
      code: "123456",
    });

    expect(result).toEqual({
      status: "COMPLETED",
      userId: "admin-1",
      verificationMethod: "EMAIL_OTP",
      recoveryCodes: Array.from({ length: 10 }, (_, index) => `RAW-${index}`),
    });
    expect(repo.completeEnrollment).toHaveBeenCalledWith({
      userId: "admin-1",
      challengeId: "challenge-1",
      recoveryCodeId: null,
      newRecoveryCodeHashes: Array.from({ length: 10 }, (_, index) => `HASH-${index}`),
      completedAt: now,
    });
    expect(JSON.stringify(vi.mocked(repo.completeEnrollment).mock.calls[0]?.[0])).not.toContain(
      "RAW-",
    );
  });

  it("preserves the V1 recovery-code fallback edge and rotates it away on completion", async () => {
    const repo = repository();
    const capability = createIdentityMfaEnrollmentCompletionCapability(
      repo,
      proofProvider(),
      recoveryProvider(),
      () => now,
    );

    const result = await capability.complete({
      userId: "admin-1",
      challengeToken: "challenge-token",
      code: "RECOVERY-CODE",
    });

    expect(result.status).toBe("COMPLETED");
    if (result.status !== "COMPLETED") throw new Error("Expected completed enrollment");
    expect(result.verificationMethod).toBe("RECOVERY_CODE");
    expect(repo.completeEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ recoveryCodeId: "old-recovery-1" }),
    );
  });

  it("increments attempt count and does not generate new recovery codes when proof is wrong", async () => {
    const repo = repository();
    const recovery = recoveryProvider();
    const capability = createIdentityMfaEnrollmentCompletionCapability(
      repo,
      proofProvider(),
      recovery,
      () => now,
    );

    await expect(
      capability.complete({
        userId: "admin-1",
        challengeToken: "challenge-token",
        code: "000000",
      }),
    ).resolves.toEqual({ status: "INVALID", code: "INVALID_CODE" });
    expect(repo.incrementChallengeAttempt).toHaveBeenCalledWith("challenge-1");
    expect(recovery.issue).not.toHaveBeenCalled();
    expect(repo.completeEnrollment).not.toHaveBeenCalled();
  });

  it.each([
    ["missing method", challenge({ mfaMethodId: null })],
    ["already enabled", challenge({ mfaEnabledAt: now })],
    ["missing pending expiry", challenge({ pendingExpiresAt: null })],
    ["expired pending state", challenge({ pendingExpiresAt: new Date(now.getTime() - 1) })],
  ])("rejects invalid enrollment state: %s", async (_label, record) => {
    const repo = repository({
      findEnrollmentChallenge: vi.fn(async () => record),
    });
    const capability = createIdentityMfaEnrollmentCompletionCapability(
      repo,
      proofProvider(),
      recoveryProvider(),
      () => now,
    );

    await expect(
      capability.complete({
        userId: "admin-1",
        challengeToken: "challenge-token",
        code: "123456",
      }),
    ).resolves.toEqual({ status: "INVALID", code: "INVALID_ENROLLMENT" });
    expect(repo.completeEnrollment).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong purpose", challenge({ purpose: "LOGIN" })],
    ["consumed", challenge({ consumedAt: new Date(now.getTime() - 1) })],
    ["expired", challenge({ expiresAt: now })],
    ["attempt ceiling", challenge({ attemptCount: 5 })],
    ["non-admin", challenge({ userRole: "CUSTOMER" })],
  ])("rejects invalid enrollment challenge: %s", async (_label, record) => {
    const repo = repository({
      findEnrollmentChallenge: vi.fn(async () => record),
    });
    const capability = createIdentityMfaEnrollmentCompletionCapability(
      repo,
      proofProvider(),
      recoveryProvider(),
      () => now,
    );

    await expect(
      capability.complete({
        userId: "admin-1",
        challengeToken: "challenge-token",
        code: "123456",
      }),
    ).resolves.toEqual({ status: "INVALID", code: "INVALID_CHALLENGE" });
  });

  it.each([
    ["CHALLENGE_REJECTED" as const, "INVALID_CHALLENGE" as const],
    ["RECOVERY_REJECTED" as const, "INVALID_CODE" as const],
    ["ENROLLMENT_REJECTED" as const, "INVALID_ENROLLMENT" as const],
  ])("maps atomic race %s fail-closed", async (commitResult, expectedCode) => {
    const repo = repository({
      completeEnrollment: vi.fn(async () => commitResult),
    });
    const capability = createIdentityMfaEnrollmentCompletionCapability(
      repo,
      proofProvider(),
      recoveryProvider(),
      () => now,
    );

    await expect(
      capability.complete({
        userId: "admin-1",
        challengeToken: "challenge-token",
        code: "123456",
      }),
    ).resolves.toEqual({ status: "INVALID", code: expectedCode });
  });

  it("fails closed when recovery-code generation does not produce exactly ten codes", async () => {
    const capability = createIdentityMfaEnrollmentCompletionCapability(
      repository(),
      proofProvider(),
      recoveryProvider({ issue: vi.fn(() => []) }),
      () => now,
    );

    await expect(
      capability.complete({
        userId: "admin-1",
        challengeToken: "challenge-token",
        code: "123456",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "RECOVERY_PROVIDER_UNAVAILABLE" });
  });
});
