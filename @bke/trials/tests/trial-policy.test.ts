import { describe, expect, it } from "vitest";
import {
  assertSelfServiceTrialAvailable,
  createTrialChangePlan,
  createTrialGrantPlan,
  normalizeSelfServiceTrialPersistenceConflict,
  validateTrialGraceDays,
} from "../logic/trial-policy";
import { trialsModuleManifest } from "../module.manifest";

const facts = {
  productId: "bke-air-stack",
  editionId: "edition-pro",
  productName: "Air Stack",
  editionName: "Professional",
  features: ["automation", "rendering"],
  maxUsers: 5,
  maxDevicesPerUser: 2,
  updatePolicy: "ACTIVE_TERM",
} as const;

describe("trial policy", () => {
  it("declares one host-independent trial policy capability", () => {
    expect(trialsModuleManifest).toEqual({ moduleId: "trials", needs: [], provides: ["trials.policy.v1"] });
  });

  it("builds the V1-compatible seven-day self-service grant plan", () => {
    const now = new Date("2026-12-29T10:00:00.000Z");
    const plan = createTrialGrantPlan({ source: "SELF_SERVICE", graceDays: 3, now, facts });
    expect(plan.selfServiceYear).toBe(2026);
    expect(plan.trialDays).toBe(7);
    expect(plan.trialEndsAt.toISOString()).toBe("2027-01-05T10:00:00.000Z");
    expect(plan.graceEndsAt.toISOString()).toBe("2027-01-08T10:00:00.000Z");
    expect(plan.order).toEqual({ status: "PAID", currency: "PHP", subtotalMinor: 0, taxMinor: 0, totalMinor: 0, billingType: "ONE_TIME", priceId: "trial:edition-pro", policyId: "edition-pro", planName: "7-day trial" });
    expect(plan.entitlement.maxUsers).toBe(5);
    expect(plan.entitlement.maxDevicesPerUser).toBe(2);
    expect(plan.license.expiresAt.toISOString()).toBe("2027-01-08T10:00:00.000Z");
    expect(plan.auditAction).toBe("TRIAL_STARTED");
  });

  it("does not assign a self-service year for admin grants", () => {
    const plan = createTrialGrantPlan({ source: "ADMIN", now: new Date("2026-09-12T00:00:00.000Z"), facts });
    expect(plan.selfServiceYear).toBeNull();
    expect(plan.graceDays).toBe(0);
    expect(plan.auditAction).toBe("TRIAL_GRANTED_BY_ADMIN");
  });

  it("enforces the exact V1 grace range", () => {
    for (const value of [0, 1, 14]) expect(validateTrialGraceDays(value)).toBe(value);
    for (const value of [-1, 15, 1.5, Number.NaN]) expect(() => validateTrialGraceDays(value)).toThrow("INVALID_GRACE_PERIOD");
  });

  it("rejects reused self-service trials and normalizes persistence races", () => {
    expect(() => assertSelfServiceTrialAvailable(true)).toThrow("TRIAL_ALREADY_USED_THIS_YEAR");
    expect(() => assertSelfServiceTrialAvailable(false)).not.toThrow();
    expect(() => normalizeSelfServiceTrialPersistenceConflict("P2002")).toThrow("TRIAL_ALREADY_USED_THIS_YEAR");
    expect(() => normalizeSelfServiceTrialPersistenceConflict("P2034")).toThrow("TRIAL_ALREADY_USED_THIS_YEAR");
    expect(() => normalizeSelfServiceTrialPersistenceConflict("P1001")).toThrow("P1001");
  });

  it("makes revoke idempotent and requests device deactivation only once", () => {
    const active = createTrialChangePlan({ state: { revokedAt: null, trialEndsAt: new Date("2026-09-20T00:00:00Z"), graceEndsAt: new Date("2026-09-20T00:00:00Z") }, action: "REVOKE", now: new Date("2026-09-12T00:00:00Z") });
    expect(active).toMatchObject({ action: "REVOKE", noop: false, deactivateDevices: true, licenseStatus: "REVOKED", licenseEventType: "TRIAL_REVOKED" });
    const already = createTrialChangePlan({ state: { revokedAt: new Date("2026-09-11T00:00:00Z"), trialEndsAt: new Date("2026-09-20T00:00:00Z"), graceEndsAt: new Date("2026-09-20T00:00:00Z") }, action: "REVOKE", now: new Date("2026-09-12T00:00:00Z") });
    expect(already).toMatchObject({ action: "REVOKE", noop: true, deactivateDevices: false });
  });

  it("rejects grace changes on revoked trials", () => {
    expect(() => createTrialChangePlan({ state: { revokedAt: new Date(), trialEndsAt: new Date("2026-09-20T00:00:00Z"), graceEndsAt: new Date("2026-09-20T00:00:00Z") }, action: "SET_GRACE", graceDays: 3, now: new Date("2026-09-12T00:00:00Z") })).toThrow("TRIAL_REVOKED");
  });

  it("derives license ACTIVE versus EXPIRED from the recalculated grace end", () => {
    const state = { revokedAt: null, trialEndsAt: new Date("2026-09-10T00:00:00Z"), graceEndsAt: new Date("2026-09-10T00:00:00Z") };
    const expired = createTrialChangePlan({ state, action: "SET_GRACE", graceDays: 1, now: new Date("2026-09-12T00:00:00Z") });
    expect(expired).toMatchObject({ action: "SET_GRACE", licenseStatus: "EXPIRED", graceDays: 1 });
    const active = createTrialChangePlan({ state, action: "SET_GRACE", graceDays: 14, now: new Date("2026-09-12T00:00:00Z") });
    expect(active).toMatchObject({ action: "SET_GRACE", licenseStatus: "ACTIVE", graceDays: 14 });
  });
});
