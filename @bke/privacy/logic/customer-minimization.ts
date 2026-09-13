import type {
  PrivacyCustomerMinimizationInput,
  PrivacyCustomerMinimizationPlan,
} from "../contracts/customer-minimization.contract";

export function planPrivacyCustomerMinimization(
  input: PrivacyCustomerMinimizationInput,
): PrivacyCustomerMinimizationPlan {
  const userId = input.userId.trim();
  const normalizedEmailHashSource = input.email.trim().toLowerCase();
  if (!userId || !normalizedEmailHashSource) {
    throw new Error("INVALID_PRIVACY_CUSTOMER_MINIMIZATION_INPUT");
  }

  const pseudonymousEmail = `removed+${userId}@privacy.invalid`;

  return Object.freeze({
    pseudonymousEmail,
    normalizedEmailHashSource,
    emailOutboxUpdate: {
      recipient: pseudonymousEmail,
      payload: { redacted: true, reason: "PRIVACY_MINIMIZATION" },
    },
    userUpdate: {
      email: pseudonymousEmail,
      name: null,
      emailVerified: null,
      lifecycleState: "PSEUDONYMIZED",
      pseudonymizedAt: input.now,
      suspendedAt: input.now,
    },
    customerAccountUpdate: {
      displayName: "Former customer",
      billingEmail: pseudonymousEmail,
      taxId: null,
      lifecycleState: "PSEUDONYMIZED",
      pseudonymizedAt: input.now,
    },
    audit: {
      action: "CUSTOMER_PERSONAL_DATA_PSEUDONYMIZED",
      targetType: "User",
      metadata: { preservedHistory: true, emailHashRetained: true },
    },
  });
}
