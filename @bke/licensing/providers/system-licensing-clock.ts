import type { LicensingClock } from "../logic/licensing-clock";

export function createSystemLicensingClock(): LicensingClock {
  return Object.freeze({
    now: () => new Date(),
  });
}
