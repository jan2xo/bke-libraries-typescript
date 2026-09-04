import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import type {
  CommercialLeaseEnvelope,
  CommercialLeasePayload,
} from "../contracts/commercial-lease.contract";
import type { CommercialLeaseSigner } from "../logic/commercial-lease-ports";
import type { CommercialSigningKeyRecord } from "../logic/commercial-signing-registry";

export interface CommercialPrivateKeyResolver {
  resolve(reference: string): Promise<string> | string;
}

function keyMaterial(value: string): string {
  return value.includes("BEGIN") ? value : Buffer.from(value, "base64").toString("utf8");
}

function canonicalPayload(payload: CommercialLeasePayload): Buffer {
  return Buffer.from(JSON.stringify(payload, Object.keys(payload).sort()), "utf8");
}

export function verifyCommercialLeaseEnvelope(
  lease: CommercialLeaseEnvelope,
  publicKey: string,
): boolean {
  if (lease.algorithm !== "Ed25519") return false;
  return verify(
    null,
    Buffer.from(lease.payload, "utf8"),
    createPublicKey(keyMaterial(publicKey)),
    Buffer.from(lease.signature, "base64"),
  );
}

export function createEd25519CommercialLeaseSigner(
  resolver: CommercialPrivateKeyResolver,
): CommercialLeaseSigner {
  return Object.freeze({
    async issue(
      payload: CommercialLeasePayload,
      key: CommercialSigningKeyRecord,
    ): Promise<CommercialLeaseEnvelope> {
      if (key.algorithm !== "Ed25519") throw new Error("COMMERCIAL_SIGNING_KEY_UNSUPPORTED");
      const privateKey = createPrivateKey(keyMaterial(await resolver.resolve(key.privateKeyReference)));
      if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("COMMERCIAL_SIGNING_KEY_INVALID");

      const serialized = canonicalPayload(payload).toString("utf8");
      const signature = sign(null, Buffer.from(serialized, "utf8"), privateKey).toString("base64");
      const derivedPublicKey = createPublicKey(privateKey);
      if (
        !verify(
          null,
          Buffer.from(serialized, "utf8"),
          derivedPublicKey,
          Buffer.from(signature, "base64"),
        )
      ) {
        throw new Error("LEASE_SIGNING_SELF_VERIFICATION_FAILED");
      }

      return Object.freeze({
        payload: serialized,
        signature,
        key_id: key.keyId,
        algorithm: "Ed25519" as const,
      });
    },
  });
}
