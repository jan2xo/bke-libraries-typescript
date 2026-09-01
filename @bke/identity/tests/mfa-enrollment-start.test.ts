import { describe, expect, it, vi } from "vitest";
import { createIdentityMfaEnrollmentStartCapability } from "../logic/mfa-enrollment-start";
import type { IdentityEmailMfaChallengeMaterialProvider } from "../logic/email-mfa-challenge-material-provider";
import type {
  IdentityMfaEnrollmentStartPersistenceInput,
  IdentityMfaEnrollmentStartRepository,
} from "../logic/mfa-enrollment-start-repository";

const now = new Date("2026-08-31T05:00:00.000Z");

function materialProvider(
  overrides: Partial<IdentityEmailMfaChallengeMaterialProvider> = {},
): IdentityEmailMfaChallengeMaterialProvider {
  return {
    issue: vi.fn(() => ({
      challengeId: "enrollment-challenge-1",
      token: "raw-enrollment-token",
      tokenHash: "hashed-enrollment-token",
      code: "654321",
      codeHash: "hashed-enrollment-code",
      reference: "DEF456",
    })),
    ...overrides,
  };
}

function repository(
  overrides: Partial<IdentityMfaEnrollmentStartRepository> = {},
): IdentityMfaEnrollmentStartRepository {
  return {
    startEnrollment: vi.fn(async () => ({
      status: "STARTED" as const,
      recipientEmail: "admin@example.com",
    })),
    ...overrides,
  };
}

describe("Identity MFA enrollment start capability", () => {
  it("starts a ten-minute enrollment without persisting raw delivery material", async () => {
    let persisted: IdentityMfaEnrollmentStartPersistenceInput | undefined;
    const repo = repository({
      startEnrollment: vi.fn(async (input) => {
        persisted = input;
        return {
          status: "STARTED" as const,
          recipientEmail: "admin@example.com",
        };
      }),
    });
    const capability = createIdentityMfaEnrollmentStartCapability(
      repo,
      materialProvider(),
      () => now,
    );

    const result = await capability.start({ userId: " admin-1 " });

    expect(result).toEqual({
      status: "STARTED",
      challengeToken: "raw-enrollment-token",
      expiresAt: new Date("2026-08-31T05:10:00.000Z"),
      delivery: {
        recipientEmail: "admin@example.com",
        code: "654321",
        reference: "DEF456",
      },
    });
    expect(persisted).toEqual({
      userId: "admin-1",
      challengeId: "enrollment-challenge-1",
      tokenHash: "hashed-enrollment-token",
      codeHash: "hashed-enrollment-code",
      pendingExpiresAt: new Date("2026-08-31T05:10:00.000Z"),
      updatedAt: now,
    });
    expect(JSON.stringify(persisted)).not.toContain("raw-enrollment-token");
    expect(JSON.stringify(persisted)).not.toContain("654321");
  });

  it.each([
    ["PRINCIPAL_NOT_FOUND" as const],
    ["FORBIDDEN" as const],
    ["MFA_ALREADY_ENABLED" as const],
  ])("maps repository rejection %s", async (code) => {
    const capability = createIdentityMfaEnrollmentStartCapability(
      repository({
        startEnrollment: vi.fn(async () => ({ status: code })),
      }),
      materialProvider(),
      () => now,
    );

    await expect(capability.start({ userId: "admin-1" })).resolves.toEqual({
      status: "REJECTED",
      code,
    });
  });

  it("rejects blank ids before generating secret material", async () => {
    const material = materialProvider();
    const repo = repository();
    const capability = createIdentityMfaEnrollmentStartCapability(
      repo,
      material,
      () => now,
    );

    await expect(capability.start({ userId: "   " })).resolves.toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
    expect(material.issue).not.toHaveBeenCalled();
    expect(repo.startEnrollment).not.toHaveBeenCalled();
  });

  it("fails closed on material or persistence failure", async () => {
    const materialFailure = createIdentityMfaEnrollmentStartCapability(
      repository(),
      materialProvider({
        issue: vi.fn(() => {
          throw new Error("entropy unavailable");
        }),
      }),
      () => now,
    );
    const persistenceFailure = createIdentityMfaEnrollmentStartCapability(
      repository({
        startEnrollment: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      }),
      materialProvider(),
      () => now,
    );

    await expect(materialFailure.start({ userId: "admin-1" })).resolves.toEqual({
      status: "FAILED",
      code: "MATERIAL_PROVIDER_UNAVAILABLE",
    });
    await expect(persistenceFailure.start({ userId: "admin-1" })).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });
});
