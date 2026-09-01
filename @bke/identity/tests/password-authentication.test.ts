import { describe, expect, it } from "vitest";
import type { IdentityPrincipal } from "../contracts/identity.contract";
import type {
  IdentityPasswordAuthenticationRecord,
  IdentityRepository,
} from "../logic/identity-repository";
import { createIdentityPasswordAuthenticationCapability } from "../logic/password-authentication";
import type { IdentityPasswordVerifier } from "../logic/password-verifier";

const customer: IdentityPrincipal = Object.freeze({
  id: "customer-1",
  email: "customer@example.com",
  name: "Customer",
  emailVerified: new Date("2026-08-30T00:00:00.000Z"),
  role: "CUSTOMER",
  suspendedAt: null,
  lifecycleState: "ACTIVE",
});

const administrator: IdentityPrincipal = Object.freeze({
  ...customer,
  id: "admin-1",
  email: "admin@example.com",
  name: "Administrator",
  role: "ADMIN",
});

function authenticationRecord(
  principal: IdentityPrincipal,
  administratorMfaEnabled = false,
): IdentityPasswordAuthenticationRecord {
  return {
    principal,
    passwordHash: "$argon2id$fixture",
    administratorMfaEnabled,
  };
}

function repository(overrides: Partial<IdentityRepository> = {}): IdentityRepository {
  return {
    findById: async () => null,
    findByEmail: async () => null,
    findPasswordAuthenticationByEmail: async () => authenticationRecord(customer),
    ...overrides,
  };
}

function verifier(
  verify: IdentityPasswordVerifier["verify"] = async () => true,
): IdentityPasswordVerifier {
  return { verify };
}

describe("Identity password authentication capability", () => {
  it("normalizes email and routes an authenticated customer to session creation", async () => {
    let persistedEmail = "";
    const identity = createIdentityPasswordAuthenticationCapability(
      repository({
        findPasswordAuthenticationByEmail: async (email) => {
          persistedEmail = email;
          return authenticationRecord(customer);
        },
      }),
      verifier(),
    );

    await expect(
      identity.authenticate({
        email: " Customer@Example.COM ",
        password: "correct-password",
      }),
    ).resolves.toEqual({
      status: "PRIMARY_AUTHENTICATED",
      principal: customer,
      route: "CUSTOMER_SESSION",
    });
    expect(persistedEmail).toBe("customer@example.com");
  });

  it("routes an administrator with MFA enabled to an MFA challenge", async () => {
    const identity = createIdentityPasswordAuthenticationCapability(
      repository({
        findPasswordAuthenticationByEmail: async () =>
          authenticationRecord(administrator, true),
      }),
      verifier(),
    );

    await expect(
      identity.authenticate({
        email: "admin@example.com",
        password: "correct-password",
      }),
    ).resolves.toMatchObject({
      status: "PRIMARY_AUTHENTICATED",
      principal: administrator,
      route: "ADMIN_MFA_CHALLENGE",
    });
  });

  it("routes an administrator without enabled MFA to enrollment", async () => {
    const identity = createIdentityPasswordAuthenticationCapability(
      repository({
        findPasswordAuthenticationByEmail: async () =>
          authenticationRecord(administrator, false),
      }),
      verifier(),
    );

    await expect(
      identity.authenticate({
        email: "admin@example.com",
        password: "correct-password",
      }),
    ).resolves.toMatchObject({
      status: "PRIMARY_AUTHENTICATED",
      route: "ADMIN_MFA_ENROLLMENT",
    });
  });

  it("collapses missing identities and bad passwords into INVALID_CREDENTIALS", async () => {
    const missing = createIdentityPasswordAuthenticationCapability(
      repository({ findPasswordAuthenticationByEmail: async () => null }),
      verifier(),
    );
    const wrongPassword = createIdentityPasswordAuthenticationCapability(
      repository(),
      verifier(async () => false),
    );

    await expect(
      missing.authenticate({ email: "missing@example.com", password: "password" }),
    ).resolves.toEqual({ status: "INVALID_CREDENTIALS" });
    await expect(
      wrongPassword.authenticate({ email: "customer@example.com", password: "wrong" }),
    ).resolves.toEqual({ status: "INVALID_CREDENTIALS" });
  });

  it("rejects invalid input without touching persistence", async () => {
    let called = false;
    const identity = createIdentityPasswordAuthenticationCapability(
      repository({
        findPasswordAuthenticationByEmail: async () => {
          called = true;
          return authenticationRecord(customer);
        },
      }),
      verifier(),
    );

    await expect(
      identity.authenticate({ email: "not-an-email", password: "password" }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    await expect(
      identity.authenticate({ email: "customer@example.com", password: "" }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(called).toBe(false);
  });

  it("maps repository failure to PERSISTENCE_UNAVAILABLE", async () => {
    const identity = createIdentityPasswordAuthenticationCapability(
      repository({
        findPasswordAuthenticationByEmail: async () => {
          throw new Error("database unavailable");
        },
      }),
      verifier(),
    );

    await expect(
      identity.authenticate({
        email: "customer@example.com",
        password: "password",
      }),
    ).resolves.toEqual({
      status: "FAILED",
      code: "PERSISTENCE_UNAVAILABLE",
    });
  });

  it("fails closed when password verification cannot verify the stored hash", async () => {
    const identity = createIdentityPasswordAuthenticationCapability(
      repository(),
      verifier(async () => {
        throw new Error("unverifiable hash");
      }),
    );

    await expect(
      identity.authenticate({
        email: "customer@example.com",
        password: "password",
      }),
    ).resolves.toEqual({ status: "INVALID_CREDENTIALS" });
  });
});
