import { describe, expect, it } from "vitest";
import {
  resolveCommercialSigningKey,
  selectActiveCommercialSigningKey,
  type CommercialSigningKeyRecord,
} from "../logic/commercial-signing-registry";

const now = new Date("2026-09-05T00:00:00.000Z");
const key = (overrides: Partial<CommercialSigningKeyRecord> = {}): CommercialSigningKeyRecord => ({
  keyId: "key-a",
  privateKeyReference: "secret://key-a",
  algorithm: "Ed25519",
  status: "ACTIVE",
  activeFrom: new Date("2026-09-01T00:00:00.000Z"),
  activeTo: null,
  revokedAt: null,
  ...overrides,
});

describe("commercial signing registry", () => {
  it("chooses the newest currently active key", () => {
    const selected = selectActiveCommercialSigningKey([
      key(),
      key({ keyId: "key-b", activeFrom: new Date("2026-09-04T00:00:00.000Z") }),
    ], now);
    expect(selected.keyId).toBe("key-b");
  });

  it("rejects future, expired, revoked, and inactive keys", () => {
    expect(() => selectActiveCommercialSigningKey([
      key({ activeFrom: new Date("2026-09-06T00:00:00.000Z") }),
      key({ keyId: "expired", activeTo: now }),
      key({ keyId: "revoked", revokedAt: new Date("2026-09-04T00:00:00.000Z") }),
      key({ keyId: "disabled", status: "DISABLED" }),
    ], now)).toThrow("COMMERCIAL_SIGNING_KEY_UNAVAILABLE");
  });

  it("resolves an exact active key id", () => {
    expect(resolveCommercialSigningKey([key()], "key-a", now).keyId).toBe("key-a");
    expect(() => resolveCommercialSigningKey([key()], "missing", now)).toThrow("COMMERCIAL_SIGNING_KEY_UNAVAILABLE");
  });
});
