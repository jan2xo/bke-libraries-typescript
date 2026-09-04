import { createPrivateKey, sign } from "node:crypto";
import type { CommercialLeaseClaims } from "../contracts/commercial-lease.contract";
import type { CommercialLeaseSigner } from "../logic/commercial-lease-ports";
import type { CommercialSigningKeyRecord } from "../logic/commercial-signing-registry";

export interface CommercialPrivateKeyResolver {
  resolve(reference: string): Promise<string> | string;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function createEd25519CommercialLeaseSigner(
  resolver: CommercialPrivateKeyResolver,
): CommercialLeaseSigner {
  return Object.freeze({
    async sign(claims: CommercialLeaseClaims, key: CommercialSigningKeyRecord): Promise<string> {
      if (key.algorithm !== "Ed25519") throw new Error("COMMERCIAL_SIGNING_KEY_UNSUPPORTED");
      const privateKeyPem = await resolver.resolve(key.privateKeyReference);
      const privateKey = createPrivateKey(privateKeyPem);
      if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("COMMERCIAL_SIGNING_KEY_INVALID");

      const encodedHeader = base64UrlJson({
        alg: "EdDSA",
        typ: "JWT",
        kid: key.keyId,
      });
      const encodedPayload = base64UrlJson(claims);
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const signature = sign(null, Buffer.from(signingInput, "utf8"), privateKey).toString("base64url");
      return `${signingInput}.${signature}`;
    },
  });
}
