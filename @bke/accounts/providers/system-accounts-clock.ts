import type { AccountsClock } from "../logic/accounts-clock";

export function createSystemAccountsClock(): AccountsClock {
  return Object.freeze({
    now: () => new Date(),
  });
}
