import { describe, expect, it, vi } from "vitest";
import { createIdentityLoginMfaVerificationCapability } from "../logic/login-mfa-verification";
import type { IdentityLoginMfaProofProvider } from "../logic/login-mfa-proof-provider";
import type {
  IdentityLoginMfaChallengeRecord,
  IdentityLoginMfaRepository,
} from "../logic/login-mfa-repository";

const now = new Date("2026-08-31T03:00:00.000Z");

function challenge(
  overrides: Partial<IdentityLoginMfaChallengeRecord> = {},
): IdentityLoginMfaChallengeRecord {
  return {
    id: "challenge-1",
    userId: "admin-1",
    purpose: "LOGIN",
    codeHash: "email-code-hash",
    expiresAt: new Date("2026-08-31T03:10:00.000Z"),
    consumedAt: null,
    attemptCount: 0,
    userRole: "ADMIN",
    ...overrides,
  };
}

function proofProvider(
  overrides: Partial<IdentityLoginMfaProofProvider> = {},
): IdentityLoginMfaProofProvider {
  return {
    hashChallengeToken: vi.fn(() => "challenge-token-hash"),
    verifyEmailCode: vi.fn((_hash, candidate) => candidate === "123456"),
    hashRecoveryCode: vi.fn((candidate) => `recovery:${candidate}`),
    ...overrides,
  };
}

function repository(
  overrides: Partial<IdentityLoginMfaRepository> = {},
): IdentityLoginMfaRepository {
  return {
    findChallengeByTokenHash: vi.fn(async () => challenge()),
    findUnusedRecoveryCode: vi.fn(async (_userId, codeHash) =>
      codeHash === "recovery:RECOVERY-CODE" ? { id: "recovery-1" } : null,
    ),
    incrementChallengeAttempt: vi.fn(async () => undefined),
    consumeChallenge: vi.fn(async () => "CONSUMED" as const),
    ...overrides,
  };
}

describe("Identity login MFA verification", () => {
  it("verifies an email OTP and consumes only the challenge", async () => {
    const repo = repository();
    const proof = proofProvider();
    const capability = createIdentityLoginMfaVerificationCapability(repo, proof, () => now);

    await expect(
      capability.verify({ challengeToken: " challenge-token ", code: "123456" }),
    ).resolves.toEqual({
      status: "VERIFIED",
      userId: "admin-1",
      authenticationMethod: "PASSWORD_EMAIL_OTP",
    });

    expect(proof.hashChallengeToken).toHaveBeenCalledWith("challenge-token");
    expect(repo.findUnusedRecoveryCode).not.toHaveBeenCalled();
    expect(repo.consumeChallenge).toHaveBeenCalledWith("challenge-1", null, now);
  });

  it("verifies an unused recovery code and consumes both records atomically", async () => {
    const repo = repository();
    const capability = createIdentityLoginMfaVerificationCapability(
      repo,
      proofProvider(),
      () => now,
    );

    await expect(
      capability.verify({ challengeToken: "challenge-token", code: "RECOVERY-CODE" }),
    ).resolves.toEqual({
      status: "VERIFIED",
      userId: "admin-1",
      authenticationMethod: "PASSWORD_RECOVERY",
    });
    expect(repo.consumeChallenge).toHaveBeenCalledWith(
      "challenge-1",
      "recovery-1",
      now,
    );
  });

  it("increments the challenge attempt when neither proof is valid", async () => {
    const repo = repository();
    const capability = createIdentityLoginMfaVerificationCapability(
      repo,
      proofProvider(),
      () => now,
    );

    await expect(
      capability.verify({ challengeToken: "challenge-token", code: "000000" }),
    ).resolves.toEqual({ status: "INVALID", code: "INVALID_CODE" });
    expect(repo.incrementChallengeAttempt).toHaveBeenCalledWith("challenge-1");
    expect(repo.consumeChallenge).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong purpose", challenge({ purpose: "RECENT_AUTH" })],
    ["already consumed", challenge({ consumedAt: new Date("2026-08-31T02:59:00.000Z") })],
    ["expired", challenge({ expiresAt: now })],
    ["attempt ceiling", challenge({ attemptCount: 5 })],
    ["non-admin", challenge({ userRole: "CUSTOMER" })],
  ])("rejects an invalid login challenge: %s", async (_label, record) => {
    const repo = repository({ findChallengeByTokenHash: vi.fn(async () => record) });
    const capability = createIdentityLoginMfaVerificationCapability(
      repo,
      proofProvider(),
      () => now,
    );

    await expect(
      capability.verify({ challengeToken: "challenge-token", code: "123456" }),
    ).resolves.toEqual({ status: "INVALID", code: "INVALID_CHALLENGE" });
    expect(repo.consumeChallenge).not.toHaveBeenCalled();
  });

  it("maps atomic consume races without granting authentication", async () => {
    const challengeRace = createIdentityLoginMfaVerificationCapability(
      repository({
        consumeChallenge: vi.fn(async () => "CHALLENGE_REJECTED" as const),
      }),
      proofProvider(),
      () => now,
    );
    await expect(
      challengeRace.verify({ challengeToken: "challenge-token", code: "123456" }),
    ).resolves.toEqual({ status: "INVALID", code: "INVALID_CHALLENGE" });

    const recoveryRace = createIdentityLoginMfaVerificationCapability(
      repository({
        consumeChallenge: vi.fn(async () => "RECOVERY_REJECTED" as const),
      }),
      proofProvider(),
      () => now,
    );
    await expect(
      recoveryRace.verify({ challengeToken: "challenge-token", code: "RECOVERY-CODE" }),
    ).resolves.toEqual({ status: "INVALID", code: "INVALID_CODE" });
  });

  it("fails closed on proof-provider or persistence failures", async () => {
    const brokenProof = proofProvider({
      hashChallengeToken: vi.fn(() => {
        throw new Error("key unavailable");
      }),
    });
    const tokenFailure = createIdentityLoginMfaVerificationCapability(
      repository(),
      brokenProof,
      () => now,
    );
    await expect(
      tokenFailure.verify({ challengeToken: "challenge-token", code: "123456" }),
    ).resolves.toEqual({ status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" });

    const brokenRepository = repository({
      findChallengeByTokenHash: vi.fn(async () => {
        throw new Error("db unavailable");
      }),
    });
    const persistenceFailure = createIdentityLoginMfaVerificationCapability(
      brokenRepository,
      proofProvider(),
      () => now,
    );
    await expect(
      persistenceFailure.verify({ challengeToken: "challenge-token", code: "123456" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
