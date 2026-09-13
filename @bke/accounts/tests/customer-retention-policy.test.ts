import { describe, expect, it } from "vitest";
import type { AccountsCustomerRetentionFacts } from "../contracts/customer-retention-policy.contract";
import { createAccountsCustomerRetentionPolicyCapability } from "../logic/customer-retention-policy";

const cleanFacts: AccountsCustomerRetentionFacts = {
  userId: "user-1",
  administratorProtected: false,
  organizationAccounts: 0,
  memberships: 0,
  licenseAssignments: 0,
  orders: 0,
  licenses: 0,
  subscriptions: 0,
  trials: 0,
  legalAcceptances: 0,
  activeSubscriptions: 0,
  unresolvedPayments: 0,
  legalHold: false,
  retentionActive: false,
  pseudonymized: false,
};

describe("Accounts customer retention policy", () => {
  it("preserves the V1 blocker order", () => {
    const capability = createAccountsCustomerRetentionPolicyCapability();
    const result = capability.evaluate({
      ...cleanFacts,
      administratorProtected: true,
      organizationAccounts: 1,
      activeSubscriptions: 1,
      unresolvedPayments: 1,
      legalHold: true,
      retentionActive: true,
      legalAcceptances: 1,
      orders: 1,
      licenses: 1,
      subscriptions: 1,
      trials: 1,
      memberships: 1,
      licenseAssignments: 1,
    });

    expect(result).toEqual({
      status: "OK",
      value: {
        userId: "user-1",
        blockers: [
          "ADMINISTRATOR_PROTECTED",
          "ORGANIZATION_OWNER_TRANSFER_REQUIRED",
          "ACTIVE_SUBSCRIPTION",
          "UNRESOLVED_PAYMENT_OR_REFUND",
          "LEGAL_HOLD",
          "RETENTION_PERIOD_ACTIVE",
          "IMMUTABLE_LEGAL_ACCEPTANCE",
          "PRESERVED_COMMERCIAL_HISTORY",
          "UNRELATED_ACCOUNT_MEMBERSHIP",
          "LICENSE_ASSIGNMENT_REMAINS",
        ],
        canPseudonymize: false,
        canMarkPurgeEligible: false,
        canPurge: false,
      },
    });
  });

  it("allows pseudonymization when the customer is not protected and has no legal hold", () => {
    const capability = createAccountsCustomerRetentionPolicyCapability();
    const result = capability.evaluate({
      ...cleanFacts,
      orders: 2,
      legalAcceptances: 1,
    });
    expect(result.status).toBe("OK");
    if (result.status === "OK") {
      expect(result.value.canPseudonymize).toBe(true);
      expect(result.value.canMarkPurgeEligible).toBe(false);
      expect(result.value.canPurge).toBe(false);
    }
  });

  it("marks a pseudonymized customer purge-eligible after hold and retention clear even when preserved-history blockers remain", () => {
    const capability = createAccountsCustomerRetentionPolicyCapability();
    const result = capability.evaluate({
      ...cleanFacts,
      pseudonymized: true,
      orders: 1,
    });
    expect(result.status).toBe("OK");
    if (result.status === "OK") {
      expect(result.value.blockers).toEqual(["PRESERVED_COMMERCIAL_HISTORY"]);
      expect(result.value.canMarkPurgeEligible).toBe(true);
      expect(result.value.canPurge).toBe(false);
    }
  });

  it("allows final purge only for a pseudonymized customer with zero blockers", () => {
    const capability = createAccountsCustomerRetentionPolicyCapability();
    const result = capability.evaluate({ ...cleanFacts, pseudonymized: true });
    expect(result).toEqual({
      status: "OK",
      value: {
        userId: "user-1",
        blockers: [],
        canPseudonymize: true,
        canMarkPurgeEligible: true,
        canPurge: true,
      },
    });
  });

  it("rejects invalid negative fact counts", () => {
    const capability = createAccountsCustomerRetentionPolicyCapability();
    expect(capability.evaluate({ ...cleanFacts, orders: -1 })).toEqual({
      status: "FAILED",
      code: "INVALID_INPUT",
    });
  });
});
