import { describe, expect, it } from "vitest";
import {
  calculateLeaseTimes,
  isLeaseExpired,
  isRefreshDue,
  leaseClaimsAreCurrent,
  validateClientCompatibility,
} from "../logic/lease-lifecycle";

describe("lease lifecycle", () => {
  const now = new Date("2026-09-05T00:00:00.000Z");

  it("calculates refresh and hard-expiry boundaries", () => {
    const times = calculateLeaseTimes(now, 60, 300);
    expect(times.issuedAt).toEqual(now);
    expect(times.refreshAfter.toISOString()).toBe("2026-09-05T00:01:00.000Z");
    expect(times.expiresAt.toISOString()).toBe("2026-09-05T00:05:00.000Z");
  });

  it.each([
    [0, 300],
    [60, 0],
    [300, 300],
    [301, 300],
    [1.5, 300],
  ])("rejects invalid lease policy %s/%s", (refresh, expiry) => {
    expect(() => calculateLeaseTimes(now, refresh, expiry)).toThrow("INVALID_LICENSE_POLICY");
  });

  it("enforces strict semantic client compatibility", () => {
    expect(() => validateClientCompatibility("1.2.3", "1.2.3")).not.toThrow();
    expect(() => validateClientCompatibility("1.3.0", "1.2.9")).not.toThrow();
    expect(() => validateClientCompatibility("2.0.0", "1.99.99")).not.toThrow();
    expect(() => validateClientCompatibility("1.2.2", "1.2.3")).toThrow("CLIENT_VERSION_MISMATCH");
    expect(() => validateClientCompatibility("1.2", "1.2.0")).toThrow("CLIENT_VERSION_MISMATCH");
  });

  it("uses inclusive refresh and expiry boundaries", () => {
    expect(isRefreshDue(now, now)).toBe(true);
    expect(isLeaseExpired(now, now)).toBe(true);
    expect(isRefreshDue(new Date(now.getTime() + 1), now)).toBe(false);
    expect(isLeaseExpired(new Date(now.getTime() + 1), now)).toBe(false);
  });

  it("accepts only current identity-bound unexpired claims", () => {
    const claims = {
      licenseId: "lic-1",
      deviceId: "dev-1",
      packageFamily: "bke-product",
      packageIdentityKey: "bke-product:desktop",
      releaseIdentityKey: "bke-product:1.0.0",
      clientVersion: "1.0.0",
      leaseKeyId: "key-1",
      expiresAt: new Date(now.getTime() + 60_000),
    };
    expect(leaseClaimsAreCurrent(claims, { ...claims, now })).toBe(true);
    expect(leaseClaimsAreCurrent(claims, { ...claims, clientVersion: "1.0.1", now })).toBe(false);
    expect(leaseClaimsAreCurrent(claims, { ...claims, now: claims.expiresAt })).toBe(false);
  });
});
