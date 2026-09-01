import { describe, expect, it, vi } from "vitest";
import { createIdentityLoginMfaChallengeIssuanceCapability } from "../logic/login-mfa-challenge-issuance";
import type { IdentityLoginMfaChallengeMaterialProvider } from "../logic/login-mfa-challenge-material-provider";
import type {
  IdentityLoginMfaChallengePersistenceInput,
  IdentityLoginMfaChallengeRepository,
} from "../logic/login-mfa-challenge-repository";

const now = new Date("2026-08-31T04:00:00.000Z");

function materialProvider(
  overrides: Partial<IdentityLoginMfaChallengeMaterialProvider> = {},
): IdentityLoginMfaChallengeMaterialProvider {
  return {
    issue: vi.fn(() => ({
      challengeId: "challenge-1",
      token: "raw-challenge-token",
      tokenHash: "hashed-challenge-token",
      code: "123456",
      codeHash: "hashed-email-code",
      reference: "ABC123",
    })),
    ...overrides,
  };
}

function repository(
  overrides: Partial<IdentityLoginMfaChallengeRepository> = {},
): IdentityLoginMfaChallengeRepository {
  return {
    replacePendingLoginChallenge: vi.fn(async () => ({
      status: "CREATED" as const,
      recipientEmail: "admin@example.com",
    })),
    ...overrides,
  };
}

describe("Identity login MFA challenge issuance", () => {
  it("issues a 10-minute LOGIN challenge while keeping raw delivery material out of persistence", async () => {
    let persisted: IdentityLoginMfaChallengePersistenceInput | undefined;
    const repo = repository({
      replacePendingLoginChallenge: vi.fn(async (input) => {
        persisted = input;
        return {
          status: "CREATED" as const,
          recipientEmail: "admin@example.com",
        };
      }),
    });
    const capability = createIdentityLoginMfaChallengeIssuanceCapability(
      repo,
      materialProvider(),
      () => now,
    );

    const result = await capability.issue({ userId: " admin-1 " });

    expect(result).toEqual({
      status: "ISSUED",
      challenge: {
        challengeToken: "raw-challenge-token",
        expiresAt: new Date("2026-08-31T04:10:00.000Z"),
        delivery: {
          recipientEmail: "admin@example.com",
          code: "123456",
          reference: "ABC123",
        },
      },
    });
    expect(persisted).toEqual({
      challengeId: "challenge-1",
      userId: "admin-1",
      tokenHash: "hashed-challenge-token",
      codeHash: "hashed-email-code",
      expiresAt: new Date("2026-08-31T04:10:00.000Z"),
    });
    expect(JSON.stringify(persisted)).not.toContain("raw-challenge-token");
    expect(JSON.stringify(persisted)).not.toContain("123456");
  });

  it("maps missing and non-admin principals without returning challenge material", async () => {
    const missing = createIdentityLoginMfaChallengeIssuanceCapability(
      repository({
        replacePendingLoginChallenge: vi.fn(async () => ({
          status: "PRINCIPAL_NOT_FOUND" as const,
        })),
      }),
      materialProvider(),
      () => now,
    );
    const forbidden = createIdentityLoginMfaChallengeIssuanceCapability(
      repository({
        replacePendingLoginChallenge: vi.fn(async () => ({
          status: "FORBIDDEN" as const,
        })),
      }),
      materialProvider(),
      () => now,
    );

    await expect(missing.issue({ userId: "missing" })).resolves.toEqual({
      status: "REJECTED",
      code: "PRINCIPAL_NOT_FOUND",
    });
    await expect(forbidden.issue({ userId: "customer-1" })).resolves.toEqual({
      status: "REJECTED",
      code: "FORBIDDEN",
    });
  });

  it("rejects blank user ids before generating secret material", async () => {
    const material = materialProvider();
    const repo = repository();
    const capability = createIdentityLoginMfaChallengeIssuanceCapability(
      repo,
      material,
      () => now,
    );

    await expect(capability.issue({ userId: "   " })).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(material.issue).not.toHaveBeenCalled();
    expect(repo.replacePendingLoginChallenge).not.toHaveBeenCalled();
  });

  it("maps material and persistence failures to typed fail-closed results", async () => {
    const materialFailure = createIdentityLoginMfaChallengeIssuanceCapability(
      repository(),
      materialProvider({
        issue: vi.fn(() => {
          throw new Error("entropy unavailable");
        }),
      }),
      () => now,
    );
    const persistenceFailure = createIdentityLoginMfaChallengeIssuanceCapability(
      repository({
        replacePendingLoginChallenge: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      }),
      materialProvider(),
      () => now,
    );

    await expect(materialFailure.issue({ userId: "admin-1" })).resolves.toEqual({
      status: "FAILED",
      code: "MATERIAL_PROVIDER_UNAVAILABLE",
    });
    await expect(persistenceFailure.issue({ userId: "admin-1" })).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});
