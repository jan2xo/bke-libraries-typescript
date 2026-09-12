import type { TrialChangePlan, TrialExistingState, TrialGrantFacts, TrialGrantPlan, TrialSource } from "../contracts/trial-policy.contract";

const DAY_MS = 86_400_000;

function addDays(date: Date, count: number) {
  return new Date(date.getTime() + count * DAY_MS);
}

export function validateTrialGraceDays(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 14) throw new Error("INVALID_GRACE_PERIOD");
  return value;
}

export function createTrialGrantPlan(input: {
  source: TrialSource;
  graceDays?: number;
  now: Date;
  facts: TrialGrantFacts;
}): TrialGrantPlan {
  const graceDays = validateTrialGraceDays(input.graceDays ?? 0);
  const trialEndsAt = addDays(input.now, 7);
  const graceEndsAt = addDays(trialEndsAt, graceDays);
  const selfServiceYear = input.source === "SELF_SERVICE" ? input.now.getUTCFullYear() : null;

  return {
    source: input.source,
    selfServiceYear,
    trialDays: 7,
    graceDays,
    trialStartsAt: new Date(input.now),
    trialEndsAt,
    graceEndsAt,
    order: {
      status: "PAID",
      currency: "PHP",
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      billingType: "ONE_TIME",
      priceId: `trial:${input.facts.editionId}`,
      policyId: input.facts.editionId,
      planName: "7-day trial",
    },
    entitlement: {
      features: [...input.facts.features],
      maxUsers: input.facts.maxUsers,
      maxDevicesPerUser: input.facts.maxDevicesPerUser,
      updatePolicy: input.facts.updatePolicy,
      trialEndsAt,
      graceEndsAt,
    },
    license: {
      status: "ACTIVE",
      maxSeats: input.facts.maxUsers,
      maxDevicesPerSeat: input.facts.maxDevicesPerUser,
      expiresAt: graceEndsAt,
      eventType: "TRIAL_ISSUED",
    },
    auditAction: input.source === "ADMIN" ? "TRIAL_GRANTED_BY_ADMIN" : "TRIAL_STARTED",
  };
}

export function assertSelfServiceTrialAvailable(existingGrantFound: boolean): void {
  if (existingGrantFound) throw new Error("TRIAL_ALREADY_USED_THIS_YEAR");
}

export function normalizeSelfServiceTrialPersistenceConflict(errorCode: string): never {
  if (errorCode === "P2002" || errorCode === "P2034") throw new Error("TRIAL_ALREADY_USED_THIS_YEAR");
  throw new Error(errorCode || "TRIAL_PERSISTENCE_FAILED");
}

export function createTrialChangePlan(input: {
  state: TrialExistingState;
  action: "REVOKE" | "SET_GRACE";
  graceDays?: number;
  now: Date;
}): TrialChangePlan {
  if (input.action === "REVOKE") {
    return {
      action: "REVOKE",
      noop: input.state.revokedAt !== null,
      deactivateDevices: input.state.revokedAt === null,
      licenseStatus: "REVOKED",
      licenseEventType: "TRIAL_REVOKED",
      auditAction: "TRIAL_REVOKED",
    };
  }

  const graceDays = validateTrialGraceDays(input.graceDays as number);
  if (input.state.revokedAt) throw new Error("TRIAL_REVOKED");
  const graceEndsAt = addDays(input.state.trialEndsAt, graceDays);
  return {
    action: "SET_GRACE",
    noop: false,
    graceDays,
    graceEndsAt,
    licenseStatus: graceEndsAt > input.now ? "ACTIVE" : "EXPIRED",
    licenseExpiresAt: graceEndsAt,
    licenseEventType: "TRIAL_GRACE_CHANGED",
    auditAction: "TRIAL_GRACE_CHANGED",
  };
}
