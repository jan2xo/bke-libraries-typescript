import { describe, expect, it } from "vitest";
import { createLicensingTrialStatePolicyCapability } from "../logic/trial-state-policy";

const policy = createLicensingTrialStatePolicyCapability();
const start = new Date("2026-09-12T00:00:00.000Z");

describe("Licensing trial state policy", () => {
  it("creates a seven-day trial with optional grace", () => {
    const result = policy.createWindow({ startsAt: start, graceDays: 3 });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;
    expect(result.value.trialEndsAt.toISOString()).toBe("2026-09-19T00:00:00.000Z");
    expect(result.value.graceEndsAt.toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });

  it("rejects grace outside zero through fourteen days", () => {
    expect(policy.createWindow({ startsAt: start, graceDays: -1 })).toEqual({ status: "FAILED", code: "INVALID_GRACE_PERIOD" });
    expect(policy.createWindow({ startsAt: start, graceDays: 15 })).toEqual({ status: "FAILED", code: "INVALID_GRACE_PERIOD" });
    expect(policy.createWindow({ startsAt: start, graceDays: 1.5 })).toEqual({ status: "FAILED", code: "INVALID_GRACE_PERIOD" });
  });

  it("changes grace and derives ACTIVE versus EXPIRED from the new end", () => {
    const active = policy.changeGrace({ trialEndsAt: new Date("2026-09-19T00:00:00.000Z"), graceDays: 2, now: new Date("2026-09-20T00:00:00.000Z") });
    expect(active.status).toBe("OK");
    if (active.status === "OK") expect(active.value.licenseStatus).toBe("ACTIVE");

    const expired = policy.changeGrace({ trialEndsAt: new Date("2026-09-19T00:00:00.000Z"), graceDays: 0, now: new Date("2026-09-20T00:00:00.000Z") });
    expect(expired.status).toBe("OK");
    if (expired.status === "OK") expect(expired.value.licenseStatus).toBe("EXPIRED");
  });

  it("blocks grace changes after revocation and keeps revoke idempotent", () => {
    expect(policy.changeGrace({ trialEndsAt: start, graceDays: 0, revokedAt: start, now: start })).toEqual({ status: "FAILED", code: "TRIAL_REVOKED" });
    const revoked = policy.revoke({ revokedAt: start, now: new Date("2026-09-13T00:00:00.000Z") });
    expect(revoked.status).toBe("OK");
    if (revoked.status !== "OK") return;
    expect(revoked.value.revokedAt).toEqual(start);
    expect(revoked.value.alreadyRevoked).toBe(true);
    expect(revoked.value.licenseStatus).toBe("REVOKED");
  });
});
