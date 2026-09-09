import { describe, expect, it } from "vitest";
import {
  isAcceptedVersionSyntax,
  isVersionAccepted,
  validateAcceptedVersionRange,
} from "../logic/accepted-version-policy";

describe("accepted software version policy", () => {
  it("exposes the semantic-version syntax used by host input validation", () => {
    expect(isAcceptedVersionSyntax("1.2.3")).toBe(true);
    expect(isAcceptedVersionSyntax("v1.2.3")).toBe(true);
    expect(isAcceptedVersionSyntax("1.2.3-beta.1")).toBe(true);
    expect(isAcceptedVersionSyntax("1.2.3+build.8")).toBe(true);
    expect(isAcceptedVersionSyntax("1.2")).toBe(false);
    expect(isAcceptedVersionSyntax("not-a-version")).toBe(false);
  });

  it("treats missing and empty bounds as unbounded", () => {
    expect(validateAcceptedVersionRange(undefined, "")).toEqual({ minimum: null, maximum: null });
    expect(isVersionAccepted("1.2.3", null, undefined)).toBe(true);
  });

  it("accepts inclusive bounds and rejects values outside them", () => {
    expect(isVersionAccepted("1.2.3", "1.2.3", "2.0.0")).toBe(true);
    expect(isVersionAccepted("1.2.2", "1.2.3", "2.0.0")).toBe(false);
    expect(isVersionAccepted("2.0.1", "1.2.3", "2.0.0")).toBe(false);
  });

  it("uses semver canonicalization while retaining prerelease and build semantics", () => {
    expect(validateAcceptedVersionRange("v1.2.3", "1.2.3+build.4")).toEqual({ minimum: "1.2.3", maximum: "1.2.3" });
    expect(isVersionAccepted("1.2.3-beta.1", "1.2.3-beta.1", "1.2.3")).toBe(true);
    expect(isVersionAccepted("1.2.3+build.8", "1.2.3", "1.2.3")).toBe(true);
  });

  it("rejects malformed or inverted policies", () => {
    expect(() => validateAcceptedVersionRange("1.2", undefined)).toThrow("INVALID_VERSION_POLICY");
    expect(() => validateAcceptedVersionRange("2.0.0", "1.0.0")).toThrow("INVALID_VERSION_POLICY");
  });

  it("checks the requested version before policy bounds", () => {
    expect(() => isVersionAccepted("1.2", "2.0.0", "1.0.0")).toThrow("INVALID_LICENSE_VERSION");
  });
});
