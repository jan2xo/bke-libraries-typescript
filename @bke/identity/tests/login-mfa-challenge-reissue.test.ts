import { describe, expect, it, vi } from "vitest";
import { createIdentityLoginMfaChallengeReissueCapability } from "../logic/login-mfa-challenge-reissue";
import type { IdentityLoginMfaRepository } from "../logic/login-mfa-repository";
import type { IdentityLoginMfaProofProvider } from "../logic/login-mfa-proof-provider";
import type { IdentityLoginMfaChallengeIssuanceCapability } from "../contracts/login-mfa-challenge.contract";

const now = new Date("2026-09-05T02:00:00.000Z");

function repository(overrides: Partial<IdentityLoginMfaRepository> = {}): IdentityLoginMfaRepository {
  return {
    findChallengeByTokenHash: vi.fn(async () => ({
      id: "challenge-1",
      userId: "admin-1",
      purpose: "LOGIN" as const,
      codeHash: "code-hash",
      expiresAt: new Date(now.getTime() + 60_000),
      consumedAt: null,
      attemptCount: 0,
      userRole: "ADMIN" as const,
    })),
    findUnusedRecoveryCode: vi.fn(async () => null),
    incrementChallengeAttempt: vi.fn(async () => undefined),
    consumeChallenge: vi.fn(async () => "CONSUMED" as const),
    ...overrides,
  };
}

const proof: IdentityLoginMfaProofProvider = {
  hashChallengeToken: vi.fn(() => "token-hash"),
  verifyEmailCode: vi.fn(() => true),
  hashRecoveryCode: vi.fn(() => "recovery-hash"),
};

function issuance(): IdentityLoginMfaChallengeIssuanceCapability {
  return {
    issue: vi.fn(async () => ({
      status: "ISSUED" as const,
      challenge: {
        challengeToken: "new-token",
        expiresAt: new Date(now.getTime() + 10 * 60_000),
        delivery: { recipientEmail: "admin@example.com", code: "123456", reference: "ABC123" },
      },
    })),
  };
}

describe("Identity login MFA challenge reissue", () => {
  it("requires a valid pending LOGIN challenge before replacing it", async () => {
    const issue = issuance();
    const capability = createIdentityLoginMfaChallengeReissueCapability(repository(), proof, issue, () => now);
    const result = await capability.reissue({ challengeToken: "old-token" });
    expect(result.status).toBe("ISSUED");
    expect(issue.issue).toHaveBeenCalledWith({ userId: "admin-1" });
  });

  it.each([
    { consumedAt: now },
    { expiresAt: now },
    { attemptCount: 5 },
    { purpose: "RECENT_AUTH" as const },
    { userRole: "CUSTOMER" as const },
  ])("rejects invalid pending challenge state %#", async (patch) => {
    const repo = repository({
      findChallengeByTokenHash: vi.fn(async () => ({
        id: "challenge-1", userId: "admin-1", purpose: "LOGIN" as const,
        codeHash: "code-hash", expiresAt: new Date(now.getTime() + 60_000),
        consumedAt: null, attemptCount: 0, userRole: "ADMIN" as const, ...patch,
      })),
    });
    await expect(createIdentityLoginMfaChallengeReissueCapability(repo, proof, issuance(), () => now)
      .reissue({ challengeToken: "old-token" }))
      .resolves.toEqual({ status: "REJECTED", code: "INVALID_MFA_CHALLENGE" });
  });
});
