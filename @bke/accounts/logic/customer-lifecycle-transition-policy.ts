import type {
  AccountsCloseCustomerPolicyInput,
  AccountsCustomerLifecyclePolicyResult,
  AccountsCustomerLifecycleTransitionPolicyCapability,
  AccountsFinalPurgePolicyInput,
  AccountsLegalHoldPolicyInput,
  AccountsMarkPurgeEligiblePolicyInput,
  AccountsPrivacyDeletionRequestPolicyInput,
  AccountsPseudonymizeCustomerPolicyInput,
  AccountsReopenCustomerPolicyInput,
} from "../contracts/customer-lifecycle-transition-policy.contract";

const CLOSED_STATES = new Set([
  "CLOSED",
  "PRIVACY_REVIEW",
  "PSEUDONYMIZED",
  "PURGE_ELIGIBLE",
]);

export function createAccountsCustomerLifecycleTransitionPolicyCapability(): AccountsCustomerLifecycleTransitionPolicyCapability {
  return Object.freeze({
    close(input: AccountsCloseCustomerPolicyInput): AccountsCustomerLifecyclePolicyResult {
      if (input.administratorProtected || input.userId === input.actorId) {
        return { status: "FAILED", code: "FORBIDDEN" };
      }
      if (CLOSED_STATES.has(input.lifecycleState)) {
        return { status: "FAILED", code: "CUSTOMER_ALREADY_CLOSED" };
      }
      if (input.organizationAccounts > 0) {
        return {
          status: "FAILED",
          code: "CUSTOMER_CLOSURE_BLOCKED",
          blockers: ["ORGANIZATION_OWNER_TRANSFER_REQUIRED"],
        };
      }
      return { status: "OK", value: undefined };
    },

    reopen(input: AccountsReopenCustomerPolicyInput): AccountsCustomerLifecyclePolicyResult {
      if (
        input.administratorProtected ||
        input.lifecycleState !== "CLOSED" ||
        input.pseudonymized ||
        input.legalHold
      ) {
        return { status: "FAILED", code: "FORBIDDEN" };
      }
      return { status: "OK", value: undefined };
    },

    requestPrivacyDeletion(
      input: AccountsPrivacyDeletionRequestPolicyInput,
    ): AccountsCustomerLifecyclePolicyResult {
      if (input.retentionExpiresAt <= input.now) {
        return {
          status: "FAILED",
          code: "RETENTION_PERIOD_ACTIVE",
          blockers: ["RETENTION_DATE_MUST_BE_FUTURE"],
        };
      }
      if (input.administratorProtected) return { status: "FAILED", code: "FORBIDDEN" };
      if (input.legalHold) return { status: "FAILED", code: "LEGAL_HOLD_ACTIVE" };
      return { status: "OK", value: undefined };
    },

    legalHold(input: AccountsLegalHoldPolicyInput) {
      if (input.administratorProtected) return { status: "FAILED", code: "FORBIDDEN" } as const;
      return {
        status: "OK",
        value: {
          legalHoldAt: input.enabled ? input.now : null,
          legalHoldReason: input.enabled
            ? input.reason?.trim().slice(0, 240) || "Administrative legal hold"
            : null,
        },
      } as const;
    },

    pseudonymize(
      input: AccountsPseudonymizeCustomerPolicyInput,
    ): AccountsCustomerLifecyclePolicyResult {
      if (!input.canPseudonymize) {
        return { status: "FAILED", code: "PRIVACY_DELETION_BLOCKED", blockers: input.blockers };
      }
      if (input.lifecycleState !== "PRIVACY_REVIEW" && input.lifecycleState !== "CLOSED") {
        return {
          status: "FAILED",
          code: "PRIVACY_DELETION_BLOCKED",
          blockers: ["PRIVACY_REVIEW_REQUIRED"],
        };
      }
      return { status: "OK", value: undefined };
    },

    markPurgeEligible(
      input: AccountsMarkPurgeEligiblePolicyInput,
    ): AccountsCustomerLifecyclePolicyResult {
      if (input.canMarkPurgeEligible) return { status: "OK", value: undefined };
      return {
        status: "FAILED",
        code: input.blockers.includes("LEGAL_HOLD") ? "LEGAL_HOLD_ACTIVE" : "PURGE_NOT_ELIGIBLE",
        blockers: input.blockers,
      };
    },

    finalPurge(input: AccountsFinalPurgePolicyInput): AccountsCustomerLifecyclePolicyResult {
      if (input.confirmation !== `PURGE ${input.userId}`) {
        return { status: "FAILED", code: "PURGE_CONFIRMATION_REQUIRED" };
      }
      if (!input.canPurge) {
        return { status: "FAILED", code: "PURGE_NOT_ELIGIBLE", blockers: input.blockers };
      }
      if (input.lifecycleState !== "PURGE_ELIGIBLE") {
        return {
          status: "FAILED",
          code: "PURGE_NOT_ELIGIBLE",
          blockers: ["MARK_PURGE_ELIGIBLE_FIRST"],
        };
      }
      return { status: "OK", value: undefined };
    },
  });
}
