import { describe, expect, it, vi } from "vitest";
import { createIdentityEmailVerificationIssuanceCapability } from "../logic/email-verification-issuance";
import type { IdentityEmailVerificationIssuanceRepository } from "../logic/email-verification-issuance-repository";
import type { IdentityEmailVerificationTokenProvider } from "../logic/email-verification-token-provider";

const now = new Date("2026-09-01T07:00:00.000Z");

function harness(
  principal: Awaited<
    ReturnType<IdentityEmailVerificationIssuanceRepository["findPrincipalById"]>
  > = {
    id: "user-1",
    email: "user@example.com",
    emailVerified: null,
  },
) {
  const repository: IdentityEmailVerificationIssuanceRepository = {
    findPrincipalById: vi.fn(async () => principal),
    replacePendingToken: vi.fn(async () => undefined),
  };
  const tokenProvider: IdentityEmailVerificationTokenProvider = {
    issue: vi.fn(() => ({
      tokenId: "verify-token-1",
      token: "raw-verification-token",
      tokenHash: "hashed-verification-token",
    })),
    hash: vi.fn(() => "hashed-verification-token"),
  };

  return {
    repository,
    tokenProvider,
    capability: createIdentityEmailVerificationIssuanceCapability(
      repository,
      tokenProvider,
      () => now,
    ),
  };
}

describe("Identity email verification issuance", () => {
  it("replaces the pending VERIFY_EMAIL token and returns trusted delivery material", async () => {
    const h = harness();
    const result = await h.capability.issue({ userId: "  user-1  " });

    expect(result).toEqual({
      status: "ISSUED",
      userId: "user-1",
      delivery: {
        recipientEmail: "user@example.com",
        token: "raw-verification-token",
      },
    });
    expect(h.repository.findPrincipalById).toHaveBeenCalledWith("user-1");
    expect(h.repository.replacePendingToken).toHaveBeenCalledWith({
      id: "verify-token-1",
      identifier: "user@example.com",
      tokenHash: "hashed-verification-token",
      expiresAt: new Date(now.getTime() + 30 * 60_000),
    });
  });

  it("returns already verified without issuing or persisting another token", async () => {
    const h = harness({
      id: "user-1",
      email: "user@example.com",
      emailVerified: new Date("2026-08-01T00:00:00.000Z"),
    });

    await expect(h.capability.issue({ userId: "user-1" })).resolves.toEqual({
      status: "ALREADY_VERIFIED",
      userId: "user-1",
      email: "user@example.com",
    });
    expect(h.tokenProvider.issue).not.toHaveBeenCalled();
    expect(h.repository.replacePendingToken).not.toHaveBeenCalled();
  });

  it("returns typed invalid-input and missing-principal outcomes", async () => {
    const invalid = harness();
    await expect(invalid.capability.issue({ userId: "   " })).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(invalid.repository.findPrincipalById).not.toHaveBeenCalled();

    const missing = harness(null);
    await expect(missing.capability.issue({ userId: "missing" })).resolves.toEqual({
      status: "REJECTED",
      code: "PRINCIPAL_NOT_FOUND",
    });
    expect(missing.tokenProvider.issue).not.toHaveBeenCalled();
  });

  it("returns typed provider and persistence failures", async () => {
    const providerFailure = harness();
    vi.mocked(providerFailure.tokenProvider.issue).mockImplementation(() => {
      throw new Error("provider unavailable");
    });
    await expect(
      providerFailure.capability.issue({ userId: "user-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" });

    const persistenceFailure = harness();
    vi.mocked(persistenceFailure.repository.replacePendingToken).mockRejectedValue(
      new Error("postgres unavailable"),
    );
    await expect(
      persistenceFailure.capability.issue({ userId: "user-1" }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
