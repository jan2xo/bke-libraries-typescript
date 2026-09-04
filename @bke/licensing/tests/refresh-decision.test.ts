import { describe, expect, it } from "vitest";
import { refreshRequiresReplacement } from "../logic/refresh-decision";

const base = {
  requestFingerprint: "fingerprint-a",
  existingFingerprint: "fingerprint-a",
  requestedVersion: "1.0.0",
  existingVersion: "1.0.0",
  hasExistingActiveLease: true,
  policyChanged: false,
  versionAccepted: true,
} as const;

describe("refreshRequiresReplacement", () => {
  it("preserves the canonical replacement priority", () => {
    expect(refreshRequiresReplacement({ ...base, existingFingerprint: null })).toEqual({ replacement: true, reason: "INITIAL_ISSUE" });
    expect(refreshRequiresReplacement({ ...base, requestFingerprint: "fingerprint-b" })).toEqual({ replacement: true, reason: "BINDING_CHANGED" });
    expect(refreshRequiresReplacement({ ...base, requestedVersion: "1.0.1" })).toEqual({ replacement: true, reason: "VERSION_CHANGED" });
    expect(refreshRequiresReplacement({ ...base, policyChanged: true })).toEqual({ replacement: true, reason: "POLICY_CHANGED" });
    expect(refreshRequiresReplacement({ ...base, hasExistingActiveLease: false })).toEqual({ replacement: true, reason: "LEASE_MISSING" });
    expect(refreshRequiresReplacement(base)).toEqual({ replacement: false, reason: "UNCHANGED" });
  });

  it("rejects versions before making any replacement decision", () => {
    expect(() => refreshRequiresReplacement({
      ...base,
      versionAccepted: false,
      existingFingerprint: null,
    })).toThrow("CLIENT_VERSION_MISMATCH");
  });
});
