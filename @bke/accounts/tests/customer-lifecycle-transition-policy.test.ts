import { describe, expect, it } from "vitest";
import { createAccountsCustomerLifecycleTransitionPolicyCapability } from "../logic/customer-lifecycle-transition-policy";

const policy = createAccountsCustomerLifecycleTransitionPolicyCapability();

describe("Accounts customer lifecycle transition policy", () => {
  it("preserves customer close guards", () => {
    expect(policy.close({
      userId: "user-1", actorId: "user-1", administratorProtected: false,
      lifecycleState: "ACTIVE", organizationAccounts: 0,
    })).toEqual({ status: "FAILED", code: "FORBIDDEN" });

    expect(policy.close({
      userId: "user-1", actorId: "admin-1", administratorProtected: true,
      lifecycleState: "ACTIVE", organizationAccounts: 0,
    })).toEqual({ status: "FAILED", code: "FORBIDDEN" });

    expect(policy.close({
      userId: "user-1", actorId: "admin-1", administratorProtected: false,
      lifecycleState: "PRIVACY_REVIEW", organizationAccounts: 0,
    })).toEqual({ status: "FAILED", code: "CUSTOMER_ALREADY_CLOSED" });

    expect(policy.close({
      userId: "user-1", actorId: "admin-1", administratorProtected: false,
      lifecycleState: "ACTIVE", organizationAccounts: 1,
    })).toEqual({
      status: "FAILED",
      code: "CUSTOMER_CLOSURE_BLOCKED",
      blockers: ["ORGANIZATION_OWNER_TRANSFER_REQUIRED"],
    });

    expect(policy.close({
      userId: "user-1", actorId: "admin-1", administratorProtected: false,
      lifecycleState: "ACTIVE", organizationAccounts: 0,
    })).toEqual({ status: "OK", value: undefined });
  });

  it("allows reopen only for a non-protected, non-pseudonymized CLOSED customer without legal hold", () => {
    expect(policy.reopen({
      administratorProtected: false, lifecycleState: "CLOSED", pseudonymized: false, legalHold: false,
    })).toEqual({ status: "OK", value: undefined });

    for (const input of [
      { administratorProtected: true, lifecycleState: "CLOSED" as const, pseudonymized: false, legalHold: false },
      { administratorProtected: false, lifecycleState: "ACTIVE" as const, pseudonymized: false, legalHold: false },
      { administratorProtected: false, lifecycleState: "CLOSED" as const, pseudonymized: true, legalHold: false },
      { administratorProtected: false, lifecycleState: "CLOSED" as const, pseudonymized: false, legalHold: true },
    ]) {
      expect(policy.reopen(input)).toEqual({ status: "FAILED", code: "FORBIDDEN" });
    }
  });

  it("requires a future privacy-retention date and rejects admin/legal-hold targets", () => {
    const now = new Date("2026-09-12T00:00:00Z");
    expect(policy.requestPrivacyDeletion({
      administratorProtected: false,
      legalHold: false,
      retentionExpiresAt: now,
      now,
    })).toEqual({
      status: "FAILED",
      code: "RETENTION_PERIOD_ACTIVE",
      blockers: ["RETENTION_DATE_MUST_BE_FUTURE"],
    });
    expect(policy.requestPrivacyDeletion({
      administratorProtected: true,
      legalHold: false,
      retentionExpiresAt: new Date("2026-09-13T00:00:00Z"),
      now,
    })).toEqual({ status: "FAILED", code: "FORBIDDEN" });
    expect(policy.requestPrivacyDeletion({
      administratorProtected: false,
      legalHold: true,
      retentionExpiresAt: new Date("2026-09-13T00:00:00Z"),
      now,
    })).toEqual({ status: "FAILED", code: "LEGAL_HOLD_ACTIVE" });
  });

  it("normalizes legal-hold timestamps and reasons exactly like V1", () => {
    const now = new Date("2026-09-12T00:00:00Z");
    expect(policy.legalHold({ administratorProtected: false, enabled: true, now })).toEqual({
      status: "OK",
      value: { legalHoldAt: now, legalHoldReason: "Administrative legal hold" },
    });
    expect(policy.legalHold({
      administratorProtected: false,
      enabled: true,
      reason: `  ${"x".repeat(300)}  `,
      now,
    })).toEqual({
      status: "OK",
      value: { legalHoldAt: now, legalHoldReason: "x".repeat(240) },
    });
    expect(policy.legalHold({ administratorProtected: false, enabled: false, reason: "ignored", now })).toEqual({
      status: "OK",
      value: { legalHoldAt: null, legalHoldReason: null },
    });
  });

  it("requires privacy-review/closed state before pseudonymization", () => {
    expect(policy.pseudonymize({
      lifecycleState: "ACTIVE", canPseudonymize: true, blockers: [],
    })).toEqual({
      status: "FAILED",
      code: "PRIVACY_DELETION_BLOCKED",
      blockers: ["PRIVACY_REVIEW_REQUIRED"],
    });
    expect(policy.pseudonymize({
      lifecycleState: "PRIVACY_REVIEW", canPseudonymize: false, blockers: ["LEGAL_HOLD"],
    })).toEqual({
      status: "FAILED", code: "PRIVACY_DELETION_BLOCKED", blockers: ["LEGAL_HOLD"],
    });
    expect(policy.pseudonymize({
      lifecycleState: "CLOSED", canPseudonymize: true, blockers: ["PRESERVED_COMMERCIAL_HISTORY"],
    })).toEqual({ status: "OK", value: undefined });
  });

  it("preserves mark-purge and final-purge guards", () => {
    expect(policy.markPurgeEligible({ canMarkPurgeEligible: false, blockers: ["LEGAL_HOLD"] })).toEqual({
      status: "FAILED", code: "LEGAL_HOLD_ACTIVE", blockers: ["LEGAL_HOLD"],
    });
    expect(policy.markPurgeEligible({ canMarkPurgeEligible: false, blockers: ["RETENTION_PERIOD_ACTIVE"] })).toEqual({
      status: "FAILED", code: "PURGE_NOT_ELIGIBLE", blockers: ["RETENTION_PERIOD_ACTIVE"],
    });

    expect(policy.finalPurge({
      userId: "user-1", confirmation: "PURGE user-2", lifecycleState: "PURGE_ELIGIBLE",
      canPurge: true, blockers: [],
    })).toEqual({ status: "FAILED", code: "PURGE_CONFIRMATION_REQUIRED" });

    expect(policy.finalPurge({
      userId: "user-1", confirmation: "PURGE user-1", lifecycleState: "PSEUDONYMIZED",
      canPurge: true, blockers: [],
    })).toEqual({
      status: "FAILED", code: "PURGE_NOT_ELIGIBLE", blockers: ["MARK_PURGE_ELIGIBLE_FIRST"],
    });

    expect(policy.finalPurge({
      userId: "user-1", confirmation: "PURGE user-1", lifecycleState: "PURGE_ELIGIBLE",
      canPurge: true, blockers: [],
    })).toEqual({ status: "OK", value: undefined });
  });
});
