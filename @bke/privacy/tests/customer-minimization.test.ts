import { describe, expect, it } from "vitest";
import { planPrivacyCustomerMinimization } from "../logic/customer-minimization";

describe("Privacy customer minimization", () => {
  it("owns the exact V1 pseudonymization and minimization intent", () => {
    const now = new Date("2026-09-13T04:00:00Z");
    const plan = planPrivacyCustomerMinimization({
      userId: " user-1 ",
      email: "  Person@Example.COM ",
      now,
    });

    expect(plan).toEqual({
      pseudonymousEmail: "removed+user-1@privacy.invalid",
      normalizedEmailHashSource: "person@example.com",
      emailOutboxUpdate: {
        recipient: "removed+user-1@privacy.invalid",
        payload: { redacted: true, reason: "PRIVACY_MINIMIZATION" },
      },
      userUpdate: {
        email: "removed+user-1@privacy.invalid",
        name: null,
        emailVerified: null,
        lifecycleState: "PSEUDONYMIZED",
        pseudonymizedAt: now,
        suspendedAt: now,
      },
      customerAccountUpdate: {
        displayName: "Former customer",
        billingEmail: "removed+user-1@privacy.invalid",
        taxId: null,
        lifecycleState: "PSEUDONYMIZED",
        pseudonymizedAt: now,
      },
      audit: {
        action: "CUSTOMER_PERSONAL_DATA_PSEUDONYMIZED",
        targetType: "User",
        metadata: { preservedHistory: true, emailHashRetained: true },
      },
    });
  });

  it("rejects missing identity facts", () => {
    const now = new Date("2026-09-13T04:00:00Z");
    expect(() => planPrivacyCustomerMinimization({ userId: " ", email: "a@example.com", now }))
      .toThrow("INVALID_PRIVACY_CUSTOMER_MINIMIZATION_INPUT");
    expect(() => planPrivacyCustomerMinimization({ userId: "user-1", email: " ", now }))
      .toThrow("INVALID_PRIVACY_CUSTOMER_MINIMIZATION_INPUT");
  });
});
