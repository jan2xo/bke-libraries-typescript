import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  AccountProductLeaseClaims,
  AccountProductLeaseTrustedKey,
  AccountProductLeaseVerificationContext,
} from "../contracts/account-product-lease.contract";
import {
  issueAccountProductLeaseJws,
  verifyAccountProductLeaseJws,
} from "../providers/ed25519-account-product-lease";

// Pin deterministic PUBLIC test vectors, not a source-only assertion.
const VECTORS_SHA256 = "6c7e947c39a1cfea9b52096d8833d9aa209fe14f2a8d05de55fe6aec841c1ed2";
const generator = fileURLToPath(new URL("./lease-vectors/generate.cjs", import.meta.url));
const output = execFileSync(process.execPath, [generator], { encoding: "utf8" });
const vectors = JSON.parse(output) as {
  now: string;
  publicKeyPem: string;
  activeKid: string;
  retiredKid: string;
  expected: Omit<AccountProductLeaseVerificationContext, "now">;
  vectors: readonly { name: string; jws: string; accept: boolean; reason?: string }[];
};
const trust = new Map<string, AccountProductLeaseTrustedKey>([
  [vectors.activeKid, { publicKeyPem: vectors.publicKeyPem, state: "ACTIVE" }],
  [vectors.retiredKid, { publicKeyPem: vectors.publicKeyPem, state: "REVOKED" }],
]);
const context: AccountProductLeaseVerificationContext = {
  ...vectors.expected,
  now: new Date(vectors.now),
};

describe("account-product execution lease JWS (portable signing contract)", () => {
  it("locks the exact cross-language golden vector bytes", () => {
    expect(createHash("sha256").update(output).digest("hex")).toBe(VECTORS_SHA256);
    expect(vectors.vectors.map(v => v.name)).toEqual([
      "valid", "expired", "wrong-product", "wrong-thumbprint",
      "unknown-kid", "retired-kid", "tampered-byte", "future-issued",
      "wrong-alg-header",
    ]);
  });

  for (const vector of vectors.vectors) {
    it("golden: " + vector.name, () => {
      const result = verifyAccountProductLeaseJws(vector.jws, trust, context);
      expect(result.ok).toBe(vector.accept);
      if (!result.ok) expect(result.reason).toBe(vector.reason);
      if (result.ok) {
        expect(result.claims.productId).toBe("render-dock");
        // Product remains licensed after refreshAfter; expiresAt is the hard stop.
        expect(Date.parse(result.claims.refreshAfter)).toBeLessThan(context.now.getTime());
        expect(Date.parse(result.claims.expiresAt)).toBeGreaterThan(context.now.getTime());
      }
    });
  }

  it("reproduces the valid JWS independently with the PUBLIC TEST-ONLY seed", () => {
    const seed = Buffer.alloc(32, 0x42);
    const privateKey = createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"), seed,
      ]),
      format: "der",
      type: "pkcs8",
    }).export({ format: "pem", type: "pkcs8" }).toString();
    const validJws = vectors.vectors[0].jws;
    const claims = JSON.parse(Buffer.from(validJws.split(".")[1], "base64url").toString("utf8")) as AccountProductLeaseClaims;
    expect(issueAccountProductLeaseJws(claims, {
      kid: vectors.activeKid, privateKeyPem: privateKey,
    })).toBe(validJws);
    const verifyOnly = new Map(trust);
    verifyOnly.set(vectors.activeKid, {
      publicKeyPem: vectors.publicKeyPem, state: "VERIFY_ONLY",
    });
    expect(verifyAccountProductLeaseJws(validJws, verifyOnly, context).ok).toBe(true);
  });

  it("enforces action, identity, exact hard expiry and restricted header", () => {
    const valid = vectors.vectors[0].jws;
    const wrongAction = verifyAccountProductLeaseJws(valid, trust, { ...context, action: "USE" });
    expect(wrongAction).toEqual({ ok: false, reason: "CLAIM_MISMATCH" });
    const wrongSession = verifyAccountProductLeaseJws(valid, trust, {
      ...context, agentSessionId: "another-session",
    });
    expect(wrongSession).toEqual({ ok: false, reason: "CLAIM_MISMATCH" });
    const claims = JSON.parse(Buffer.from(valid.split(".")[1], "base64url").toString("utf8")) as AccountProductLeaseClaims;
    expect(verifyAccountProductLeaseJws(valid, trust, {
      ...context, now: new Date(claims.expiresAt),
    })).toEqual({ ok: false, reason: "EXPIRED" });
    expect(verifyAccountProductLeaseJws(valid + "=", trust, context)).toEqual({
      ok: false, reason: "MALFORMED_JWS",
    });
  });
});
