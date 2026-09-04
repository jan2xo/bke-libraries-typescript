import { describe, expect, it } from "vitest";
import {
  resolveCommercialPrivateKey,
  selectActiveCommercialSigningKey,
  type CommercialSigningKeyRecord,
} from "../logic/commercial-signing-registry";

function key(overrides: Partial<CommercialSigningKeyRecord> = {}): CommercialSigningKeyRecord {
  return Object.freeze({
    id: "key-record-1",
    keyId: "key-1",
    algorithm: "Ed25519",
    status: "ACTIVE",
    publicKey: "public-key",
    privateKeyReference: "env:LICENSE_SIGNING_PRIVATE_KEY",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    activatedAt: new Date("2026-09-01T00:00:00.000Z"),
    retiredAt: null,
    rotationReason: null,
    createdBy: null,
    ...overrides,
  });
}

describe("commercial signing registry", () => {
  it("selects the only active signing key", () => {
    const active = key();
    expect(selectActiveCommercialSigningKey([active, key({ id: "retired", keyId: "old", status: "RETIRED" })])).toBe(active);
  });

  it("fails closed when no active key exists", () => {
    expect(() => selectActiveCommercialSigningKey([])).toThrow("NO_ACTIVE_SIGNING_KEY");
  });

  it("fails closed when multiple active keys exist", () => {
    expect(() =>
      selectActiveCommercialSigningKey([
        key(),
        key({ id: "key-record-2", keyId: "key-2" }),
      ]),
    ).toThrow("MULTIPLE_ACTIVE_SIGNING_KEYS");
  });

  it("resolves env-backed private key references without owning deployment secrets", () => {
    expect(
      resolveCommercialPrivateKey("env:LEASE_KEY", { LEASE_KEY: "private-value" }),
    ).toBe("private-value");
  });

  it("rejects unsupported and unresolved secret references", () => {
    expect(() => resolveCommercialPrivateKey("file:/tmp/key", {})).toThrow(
      "SIGNING_KEY_REFERENCE_UNSUPPORTED",
    );
    expect(() => resolveCommercialPrivateKey("env:MISSING", {})).toThrow(
      "SIGNING_KEY_UNRESOLVED",
    );
  });
});
