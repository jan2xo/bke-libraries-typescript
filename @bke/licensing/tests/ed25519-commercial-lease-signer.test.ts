import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CommercialLeaseClaims } from "../contracts/commercial-lease.contract";
import type { CommercialSigningKeyRecord } from "../logic/commercial-signing-registry";
import { createEd25519CommercialLeaseSigner } from "../providers/ed25519-commercial-lease-signer";

const claims: CommercialLeaseClaims = {
  sub: "account-1",
  licenseId: "license-1",
  deviceId: "device-1",
  productId: "bke-product",
  productVersionId: "bke-product:1.0.0",
  packageFamily: "bke-product",
  packageIdentityKey: "bke-product:desktop",
  releaseIdentityKey: "bke-product:1.0.0",
  clientVersion: "1.0.0",
  contractVersion: "3",
  entitlements: ["BKE_SOFTWARE_ACCESS"],
  signingKeyId: "key-1",
  leaseKeyId: "key-1",
  leaseKeyIssuedAt: 1_788_000_000,
  iat: 1_788_000_000,
  nbf: 1_788_000_000,
  refreshAfter: 1_788_000_060,
  exp: 1_788_000_300,
  jti: "lease-1",
};

describe("Ed25519 commercial lease signer", () => {
  it("emits the canonical EdDSA JWT-shaped lease token", async () => {
    const pair = generateKeyPairSync("ed25519");
    const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const key: CommercialSigningKeyRecord = {
      keyId: "key-1",
      privateKeyReference: "secret://lease-key",
      algorithm: "Ed25519",
      status: "ACTIVE",
      activeFrom: new Date("2026-09-01T00:00:00.000Z"),
      activeTo: null,
      revokedAt: null,
    };
    const signer = createEd25519CommercialLeaseSigner({
      resolve(reference) {
        expect(reference).toBe("secret://lease-key");
        return privatePem;
      },
    });

    const token = await signer.sign(claims, key);
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString("utf8"))).toEqual({
      alg: "EdDSA",
      typ: "JWT",
      kid: "key-1",
    });
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"))).toEqual(claims);
    expect(verify(
      null,
      Buffer.from(`${header}.${payload}`, "utf8"),
      createPublicKey(pair.privateKey),
      Buffer.from(signature!, "base64url"),
    )).toBe(true);
  });

  it("rejects unsupported registry algorithms", async () => {
    const signer = createEd25519CommercialLeaseSigner({ resolve: () => "unused" });
    await expect(signer.sign(claims, {
      keyId: "key-1",
      privateKeyReference: "secret://lease-key",
      algorithm: "RSA",
      status: "ACTIVE",
      activeFrom: new Date(),
      activeTo: null,
      revokedAt: null,
    })).rejects.toThrow("COMMERCIAL_SIGNING_KEY_UNSUPPORTED");
  });
});
