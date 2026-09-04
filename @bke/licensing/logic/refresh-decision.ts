export type LeaseRefreshReplacementReason =
  | "INITIAL_ISSUE"
  | "BINDING_CHANGED"
  | "VERSION_CHANGED"
  | "POLICY_CHANGED"
  | "LEASE_MISSING"
  | "UNCHANGED";

export type LeaseRefreshDecisionInput = Readonly<{
  requestFingerprint: string;
  existingFingerprint: string | null;
  requestedVersion: string;
  existingVersion: string | null;
  hasExistingActiveLease: boolean;
  policyChanged: boolean;
  versionAccepted: boolean;
}>;

export type LeaseRefreshDecision = Readonly<{
  replacement: boolean;
  reason: LeaseRefreshReplacementReason;
}>;

export function refreshRequiresReplacement(
  input: LeaseRefreshDecisionInput,
): LeaseRefreshDecision {
  if (!input.versionAccepted) throw new Error("CLIENT_VERSION_MISMATCH");
  if (input.existingFingerprint === null) {
    return Object.freeze({ replacement: true, reason: "INITIAL_ISSUE" });
  }
  if (input.requestFingerprint !== input.existingFingerprint) {
    return Object.freeze({ replacement: true, reason: "BINDING_CHANGED" });
  }
  if (input.requestedVersion !== input.existingVersion) {
    return Object.freeze({ replacement: true, reason: "VERSION_CHANGED" });
  }
  if (input.policyChanged) {
    return Object.freeze({ replacement: true, reason: "POLICY_CHANGED" });
  }
  if (!input.hasExistingActiveLease) {
    return Object.freeze({ replacement: true, reason: "LEASE_MISSING" });
  }
  return Object.freeze({ replacement: false, reason: "UNCHANGED" });
}
