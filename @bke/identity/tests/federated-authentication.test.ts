import { describe, expect, it } from "vitest";
import type { IdentityPrincipal } from "../contracts/identity.contract";
import { createIdentityFederatedAuthenticationCapability } from "../logic/federated-authentication";

const principal = (overrides: Partial<IdentityPrincipal> = {}): IdentityPrincipal => ({
  id: "user-1",
  email: "buyer@example.com",
  name: "Buyer",
  emailVerified: new Date("2026-01-01T00:00:00Z"),
  role: "CUSTOMER",
  establishedAt: new Date("2026-01-01T00:00:00Z"),
  suspendedAt: null,
  lifecycleState: "ACTIVE",
  ...overrides,
});

const assertion = {
  provider: "GOOGLE" as const,
  subject: "google-sub-123",
  email: "buyer@example.com",
  emailVerified: true,
  name: "Buyer",
  authenticatedAt: new Date("2026-09-19T00:00:00Z"),
};

describe("Identity federated authentication", () => {
  it("uses an existing provider subject as the durable binding", async () => {
    let links = 0;
    const capability = createIdentityFederatedAuthenticationCapability({
      async findByProviderSubject() { return { principal: principal(), provider: "GOOGLE", subject: assertion.subject }; },
      async findPrincipalByEmail() { throw new Error("must not be called"); },
      async linkExistingByVerifiedEmail() { links += 1; return { status: "CONFLICT" as const }; },
      async recordAuthentication() {},
    });
    const result = await capability.authenticate(assertion);
    expect(result).toMatchObject({ status: "AUTHENTICATED", binding: "EXISTING", principal: { id: "user-1" } });
    expect(links).toBe(0);
  });

  it("links a verified provider assertion to an existing customer with the same email", async () => {
    const capability = createIdentityFederatedAuthenticationCapability({
      async findByProviderSubject() { return null; },
      async findPrincipalByEmail() { return principal(); },
      async linkExistingByVerifiedEmail() { return { status: "LINKED" as const, principal: principal() }; },
      async recordAuthentication() {},
    });
    expect(await capability.authenticate(assertion)).toMatchObject({
      status: "AUTHENTICATED",
      binding: "LINKED_BY_VERIFIED_EMAIL",
      principal: { id: "user-1" },
    });
  });

  it("rejects auto-link when the existing BKE email has never been verified", async () => {
    let links = 0;
    const capability = createIdentityFederatedAuthenticationCapability({
      async findByProviderSubject() { return null; },
      async findPrincipalByEmail() { return principal({ emailVerified: null }); },
      async linkExistingByVerifiedEmail() {
        links += 1;
        return { status: "LINKED" as const, principal: principal() };
      },
      async recordAuthentication() {},
    });
    expect(await capability.authenticate(assertion))
      .toEqual({ status: "REJECTED", code: "EMAIL_LINK_REQUIRES_VERIFICATION" });
    expect(links).toBe(0);
  });

  it("requires registration instead of inventing a BKE user when no account exists", async () => {
    const capability = createIdentityFederatedAuthenticationCapability({
      async findByProviderSubject() { return null; },
      async findPrincipalByEmail() { return null; },
      async linkExistingByVerifiedEmail() { throw new Error("must not be called"); },
      async recordAuthentication() {},
    });
    expect(await capability.authenticate(assertion)).toEqual({
      status: "REGISTRATION_REQUIRED",
      profile: {
        provider: "GOOGLE",
        subject: "google-sub-123",
        email: "buyer@example.com",
        name: "Buyer",
        authenticatedAt: assertion.authenticatedAt,
      },
    });
  });

  it("rejects unverified provider email assertions", async () => {
    const capability = createIdentityFederatedAuthenticationCapability({
      async findByProviderSubject() { throw new Error("must not be called"); },
      async findPrincipalByEmail() { throw new Error("must not be called"); },
      async linkExistingByVerifiedEmail() { throw new Error("must not be called"); },
      async recordAuthentication() {},
    });
    expect(await capability.authenticate({ ...assertion, emailVerified: false }))
      .toEqual({ status: "REJECTED", code: "EMAIL_NOT_VERIFIED" });
  });

  it("never uses federation to authenticate administrators", async () => {
    const capability = createIdentityFederatedAuthenticationCapability({
      async findByProviderSubject() {
        return { principal: principal({ role: "ADMIN" }), provider: "GOOGLE", subject: assertion.subject };
      },
      async findPrincipalByEmail() { return null; },
      async linkExistingByVerifiedEmail() { throw new Error("must not be called"); },
      async recordAuthentication() {},
    });
    expect(await capability.authenticate(assertion))
      .toEqual({ status: "REJECTED", code: "ADMIN_FEDERATION_FORBIDDEN" });
  });
});
