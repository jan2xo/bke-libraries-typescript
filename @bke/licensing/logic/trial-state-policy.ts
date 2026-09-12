import {
  LICENSING_TRIAL_MAX_GRACE_DAYS,
  LICENSING_TRIAL_TERM_DAYS,
  type LicensingTrialStatePolicyCapability,
} from "../contracts/trial-state-policy.contract";

type CreateWindowInput = Parameters<LicensingTrialStatePolicyCapability["createWindow"]>[0];
type ChangeGraceInput = Parameters<LicensingTrialStatePolicyCapability["changeGrace"]>[0];
type RevokeInput = Parameters<LicensingTrialStatePolicyCapability["revoke"]>[0];

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 86_400_000);
}

function validGraceDays(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= LICENSING_TRIAL_MAX_GRACE_DAYS;
}

export function createLicensingTrialStatePolicyCapability(): LicensingTrialStatePolicyCapability {
  return Object.freeze({
    createWindow(input: CreateWindowInput) {
      const graceDays = input.graceDays ?? 0;
      if (!validGraceDays(graceDays)) {
        return { status: "FAILED", code: "INVALID_GRACE_PERIOD" } as const;
      }
      const trialEndsAt = addUtcDays(input.startsAt, LICENSING_TRIAL_TERM_DAYS);
      return {
        status: "OK",
        value: {
          startsAt: input.startsAt,
          trialEndsAt,
          graceEndsAt: addUtcDays(trialEndsAt, graceDays),
          graceDays,
        },
      } as const;
    },

    changeGrace(input: ChangeGraceInput) {
      if (!validGraceDays(input.graceDays)) {
        return { status: "FAILED", code: "INVALID_GRACE_PERIOD" } as const;
      }
      if (input.revokedAt) {
        return { status: "FAILED", code: "TRIAL_REVOKED" } as const;
      }
      const graceEndsAt = addUtcDays(input.trialEndsAt, input.graceDays);
      return {
        status: "OK",
        value: {
          graceEndsAt,
          licenseStatus: graceEndsAt > input.now ? "ACTIVE" : "EXPIRED",
          eventType: "TRIAL_GRACE_CHANGED",
        },
      } as const;
    },

    revoke(input: RevokeInput) {
      const alreadyRevoked = Boolean(input.revokedAt);
      return {
        status: "OK",
        value: {
          revokedAt: input.revokedAt ?? input.now,
          licenseStatus: "REVOKED",
          eventType: "TRIAL_REVOKED",
          alreadyRevoked,
        },
      } as const;
    },
  });
}
