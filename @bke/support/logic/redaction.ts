import type { SupportSafeObject } from "../contracts/support.contract";

const forbidden = /password|passphrase|secret|token|api.?key|access.?key|private.?key|license.?key|authorization|cookie|signature|checkout.?url|payload|request.?body/i;

export function redactSupportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSupportValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, forbidden.test(key) ? "[REDACTED]" : redactSupportValue(nested)]));
  }
  return value;
}

export function redactSupportObject(value: SupportSafeObject): SupportSafeObject {
  return Object.freeze(redactSupportValue(value) as Record<string, unknown>);
}
