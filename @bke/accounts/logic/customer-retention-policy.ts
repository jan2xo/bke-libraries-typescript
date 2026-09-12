import type {
  AccountsCustomerRetentionFacts,
  AccountsCustomerRetentionPolicyCapability,
  AccountsCustomerRetentionPolicyResult,
} from "../contracts/customer-retention-policy.contract";

function nonNegativeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validFacts(facts: AccountsCustomerRetentionFacts) {
  return (
    facts.userId.trim().length > 0 &&
    nonNegativeInteger(facts.organizationAccounts) &&
    nonNegativeInteger(facts.memberships) &&
    nonNegativeInteger(facts.licenseAssignments) &&
    nonNegativeInteger(facts.orders) &&
    nonNegativeInteger(facts.licenses) &&
    nonNegativeInteger(facts.subscriptions) &&
    nonNegativeInteger(facts.trials) &&
    nonNegativeInteger(facts.legalAcceptances) &&
    nonNegativeInteger(facts.activeSubscriptions) &&
    nonNegativeInteger(facts.unresolvedPayments)
  );
}

export function createAccountsCustomerRetentionPolicyCapability(): AccountsCustomerRetentionPolicyCapability {
  return Object.freeze({
    evaluate(facts: AccountsCustomerRetentionFacts): AccountsCustomerRetentionPolicyResult {
      if (!validFacts(facts)) return { status: "FAILED", code: "INVALID_INPUT" };

      const blockers = [] as Exclude<
        AccountsCustomerRetentionPolicyResult,
        { readonly status: "FAILED" }
      >["value"]["blockers"] extends readonly (infer T)[] ? T[] : never;

      if (facts.administratorProtected) blockers.push("ADMINISTRATOR_PROTECTED");
      if (facts.organizationAccounts > 0) blockers.push("ORGANIZATION_OWNER_TRANSFER_REQUIRED");
      if (facts.activeSubscriptions > 0) blockers.push("ACTIVE_SUBSCRIPTION");
      if (facts.unresolvedPayments > 0) blockers.push("UNRESOLVED_PAYMENT_OR_REFUND");
      if (facts.legalHold) blockers.push("LEGAL_HOLD");
      if (facts.retentionActive) blockers.push("RETENTION_PERIOD_ACTIVE");
      if (facts.legalAcceptances > 0) blockers.push("IMMUTABLE_LEGAL_ACCEPTANCE");
      if (facts.orders > 0 || facts.licenses > 0 || facts.subscriptions > 0 || facts.trials > 0) {
        blockers.push("PRESERVED_COMMERCIAL_HISTORY");
      }
      if (facts.memberships > 0) blockers.push("UNRELATED_ACCOUNT_MEMBERSHIP");
      if (facts.licenseAssignments > 0) blockers.push("LICENSE_ASSIGNMENT_REMAINS");

      return {
        status: "OK",
        value: {
          userId: facts.userId.trim(),
          blockers,
          canPseudonymize: !facts.administratorProtected && !facts.legalHold,
          canMarkPurgeEligible: facts.pseudonymized && !facts.legalHold && !facts.retentionActive,
          canPurge: facts.pseudonymized && blockers.length === 0,
        },
      };
    },
  });
}
