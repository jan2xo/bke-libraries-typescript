import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { verifyAccountProductLeaseJws } from "../providers/ed25519-account-product-lease";
import type {
  AccountProductLeaseTrustedKey,
  AccountProductLeaseVerificationContext,
} from "../contracts/account-product-lease.contract";

const EMBEDDED_FIXTURE = {
  jws: "eyJhbGciOiJFZERTQSIsImtpZCI6InV0bS1zdGFuZGFsb25lLWlzc3Vlci0yMDI2IiwidHlwIjoiYmtlLnByb2R1Y3QtbGVhc2UudjErandzIn0.eyJzY2hlbWEiOiJia2UucHJvZHVjdC1sZWFzZS52MSIsImlzc3VlciI6IkJLRSBEaWdpdGFsIFNvbHV0aW9ucyIsImF1ZGllbmNlIjoiYmtlLXByb2R1Y3QiLCJsZWFzZUlkIjoiNjUwOTNkYjctMjc4Ni00YjQ1LWIwYmUtZTJhYjZhZTY4MWFiIiwiYWNjb3VudElkIjoiYWNjXzAwMDAwMDAwMDAwMDAwMDEiLCJ1c2VySWQiOiJ1c3JfMDAwMDAwMDAwMDAwMDAwMSIsInByb2R1Y3RJZCI6ImJrZS1hY2NlcHRhbmNlLWNsaWVudCIsImFnZW50U2Vzc2lvbklkIjoic2VzXzAwMDAwMDAwMDAwMDAwMDEiLCJhZ2VudEtleVRodW1icHJpbnQiOiIwS3piWTY1MkYzS3lnZ3JaQnM3QWtJWm1TRHNnUXZULXM4WmQ1Wlc5aWtrIiwia2V5UHJvdGVjdGlvbiI6InNvZnR3YXJlIiwicGxhbiI6InN1YnNjcmlwdGlvbiIsImFsbG93ZWRBY3Rpb25zIjpbIk9QRU4iXSwiaXNzdWVkQXQiOiIyMDI2LTExLTE2VDA2OjA3OjA1LjEyN1oiLCJyZWZyZXNoQWZ0ZXIiOiIyMDI2LTExLTE2VDA2OjA4OjM1LjEyN1oiLCJleHBpcmVzQXQiOiIyMDI2LTExLTE2VDA2OjEwOjA1LjEyN1oifQ.oCVRR9KzJGgiVyyT-a_lDYWlu1Uhbks5cHGV_30jotlmto26ozbuvU9ZsFkKBUlgPded7dxhvyDQcIqJMFjlDg",
  kid: "utm-standalone-issuer-2026",
  claims: {
    schema: "bke.product-lease.v1" as const,
    issuer: "BKE Digital Solutions",
    audience: "bke-product",
    leaseId: "65093db7-2786-4b45-b0be-e2ab6ae681ab",
    accountId: "acc_0000000000000001",
    userId: "usr_0000000000000001",
    productId: "bke-acceptance-client",
    agentSessionId: "ses_0000000000000001",
    agentKeyThumbprint: "0KzbY652F3KyggrZBs7AkIZmSDsgQvT-s8Zd5ZW9ikk",
    keyProtection: "software" as const,
    plan: "subscription",
    allowedActions: ["OPEN"] as const,
    issuedAt: "2026-11-16T06:07:05.127Z",
    refreshAfter: "2026-11-16T06:08:35.127Z",
    expiresAt: "2026-11-16T06:10:05.127Z",
  },
  pubPem:
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAi8bkLe2jeCmpNxlop/pIoXD2R/XVGgpmE0whdPiFj2Q=\n-----END PUBLIC KEY-----\n",
};

function getFixture() {
  const leaseFile = path.resolve(__dirname, "../../../../latest-lease.json");
  if (fs.existsSync(leaseFile)) {
    try {
      return JSON.parse(fs.readFileSync(leaseFile, "utf8"));
    } catch {}
  }
  return EMBEDDED_FIXTURE;
}

describe("Genuine DS-Issued Account Product Lease Verification (TypeScript)", () => {
  it("verifies the genuine DS-issued lease successfully with matching claims", () => {
    const data = getFixture();
    const { jws, kid, claims, pubPem } = data;

    const keys = new Map<string, AccountProductLeaseTrustedKey>([
      [
        kid,
        {
          publicKeyPem: pubPem,
          state: "ACTIVE",
        },
      ],
    ]);

    const context: AccountProductLeaseVerificationContext = {
      issuer: claims.issuer,
      audience: claims.audience,
      accountId: claims.accountId,
      userId: claims.userId,
      productId: claims.productId,
      agentSessionId: claims.agentSessionId,
      agentKeyThumbprint: claims.agentKeyThumbprint,
      action: "OPEN",
      now: new Date(claims.issuedAt),
    };

    const result = verifyAccountProductLeaseJws(jws, keys, context);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Verification failed unexpectedly");

    expect(result.kid).toBe(kid);
    expect(result.claims.leaseId).toBe(claims.leaseId);
    expect(result.claims.accountId).toBe(claims.accountId);
    expect(result.claims.userId).toBe(claims.userId);
    expect(result.claims.productId).toBe(claims.productId);
    expect(result.claims.agentSessionId).toBe(claims.agentSessionId);
    expect(result.claims.agentKeyThumbprint).toBe(claims.agentKeyThumbprint);
    expect(result.claims.keyProtection).toBe(claims.keyProtection);
    expect(result.claims.plan).toBe(claims.plan);
    expect(result.claims.allowedActions).toEqual(claims.allowedActions);
    expect(result.claims.issuedAt).toBe(claims.issuedAt);
    expect(result.claims.refreshAfter).toBe(claims.refreshAfter);
    expect(result.claims.expiresAt).toBe(claims.expiresAt);

    // Save extracted claims if scratch dir exists
    const scratchDir = path.resolve(__dirname, "../../../../");
    if (fs.existsSync(scratchDir)) {
      try {
        fs.writeFileSync(
          path.join(scratchDir, "ts-verified-claims.json"),
          JSON.stringify(
            {
              runtime: "TypeScript/@bke/licensing",
              ok: true,
              kid: result.kid,
              claims: result.claims,
            },
            null,
            2
          )
        );
      } catch {}
    }
  });

  it("rejects tampered signature fail-closed", () => {
    const data = getFixture();
    const { jws, kid, claims, pubPem } = data;

    const keys = new Map<string, AccountProductLeaseTrustedKey>([
      [kid, { publicKeyPem: pubPem, state: "ACTIVE" }],
    ]);

    const context: AccountProductLeaseVerificationContext = {
      issuer: claims.issuer,
      audience: claims.audience,
      accountId: claims.accountId,
      userId: claims.userId,
      productId: claims.productId,
      agentSessionId: claims.agentSessionId,
      agentKeyThumbprint: claims.agentKeyThumbprint,
      action: "OPEN",
      now: new Date(claims.issuedAt),
    };

    const parts = jws.split(".");
    const tamperedSig = parts[2].slice(0, -4) + "AAAA";
    const tamperedJws = `${parts[0]}.${parts[1]}.${tamperedSig}`;

    const result = verifyAccountProductLeaseJws(tamperedJws, keys, context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INVALID_SIGNATURE");
    }
  });

  it("rejects expired lease fail-closed", () => {
    const data = getFixture();
    const { jws, kid, claims, pubPem } = data;

    const keys = new Map<string, AccountProductLeaseTrustedKey>([
      [kid, { publicKeyPem: pubPem, state: "ACTIVE" }],
    ]);

    const context: AccountProductLeaseVerificationContext = {
      issuer: claims.issuer,
      audience: claims.audience,
      accountId: claims.accountId,
      userId: claims.userId,
      productId: claims.productId,
      agentSessionId: claims.agentSessionId,
      agentKeyThumbprint: claims.agentKeyThumbprint,
      action: "OPEN",
      now: new Date(Date.parse(claims.expiresAt) + 10000),
    };

    const result = verifyAccountProductLeaseJws(jws, keys, context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("EXPIRED");
    }
  });
});
