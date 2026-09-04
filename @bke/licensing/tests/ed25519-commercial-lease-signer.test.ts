import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CommercialLeasePayload } from "../contracts/commercial-lease.contract";
import type { CommercialSigningKeyRecord } from "../logic/commercial-signing-registry";
import {
  createEd25519CommercialLeaseSigner,
  verifyCommercialLeaseEnvelope,
} from "../providers/ed25519-commercial-lease-signer";

const pair = generateKeyPairSync("ed25519");
const privateKey = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKey = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
const key: CommercialSigningKeyRecord = Object.freeze({
  id: "key-record-1",
  keyId: "lease-key-1",
  algorithm: "Ed25519",
  status: "ACTIVE",
  publicKey,
  privateKeyReference: "env:TEST_LEASE_PRIVATE_KEY",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  activatedAt: new Date("2026-09-01T00:00:00.000Z"),
  retiredAt: null,
  rotationReason: null,
  createdBy: null,
});
const payload: CommercialLeasePayload = Object.freeze({
  license_id: "license-1",
  lease_id: "lease-1",
  generation: 1,
  server_revision: 1,
  product_id: "bke-test-product",
  installation_id: "installation-1",
  device_id: "device-identity-0001",
  version: "1.2.3",
  issuer: "BKE Digital Solutions",
  issued_at: "2026-09-05T00:00:00.000Z",
  not_before: "2026-09-05T00:00:00.000Z",
  expires_at: "2026-10-05T00:00:00.000Z",
  key_id: "lease-key-1",
  algorithm: "Ed25519",
  revoked: false,
  superseded_by: null,
});

describe("Ed25519 commercial lease signer", () => {
  it("emits the legacy canonical JSON envelope and a verifiable base64 signature", async () => {
    const signer = createEd25519CommercialLeaseSigner({
      resolve(reference) {
        expect(reference).toBe("env:TEST_LEASE_PRIVATE_KEY");
        return privateKey;
      },
    });

    const lease = await signer.issue(payload, key);
    expect(lease.payload).toBe(JSON.stringify(payload, Object.keys(payload).sort()));
    expect(lease.key_id).toBe("lease-key-1");
    expect(lease.algorithm).toBe("Ed25519");
    expect(Buffer.from(lease.signature, "base64").length).toBeGreaterThan(0);
    expect(verifyCommercialLeaseEnvelope(lease, publicKey)).toBe(true);
  });

  it("accepts base64-encoded PEM key material", async () => {
    const signer = createEd25519CommercialLeaseSigner({
      resolve: () => Buffer.from(privateKey, "utf8").toString("base64"),
    });
    const lease = await signer.issue(payload, key);
    expect(verifyCommercialLeaseEnvelope(lease, Buffer.from(publicKey, "utf8").toString("base64"))).toBe(true);
  });
});
