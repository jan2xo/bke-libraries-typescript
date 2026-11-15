import { execFileSync } from "node:child_process";
import { createCipheriv, createHash, createPrivateKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  AccountProductLeaseClaims,
  AccountProductLeaseTrustedKey,
  AccountProductLeaseVerificationContext,
} from "../contracts/account-product-lease.contract";
import type {
  CommercialLeaseEnvelope,
  CommercialLeasePayload,
  CommercialLeaseTrustedKey,
  CommercialLeaseVerificationContext,
} from "../contracts/commercial-lease.contract";
import {
  allowsProductActivation,
  assertSafeProductActivationModeChange,
  evaluateProductActivationMode,
} from "../logic/activation-mode-policy";
import { createCommercialLeaseCapability } from "../logic/commercial-lease";
import { createLicensingGracePeriodCapability } from "../logic/grace-period";
import {
  createInMemoryLeaseChallengeStore,
  issueLeaseChallenge,
  signLeaseChallengeProof,
  verifyAndConsumeLeaseChallengeProof,
} from "../logic/lease-challenge-proof";
import { createLicensingLicenseKeyRevealCapability } from "../logic/license-key-reveal";
import { createAesGcmLicensingLicenseKeyDecrypter } from "../providers/aes-gcm-license-key-decrypter";
import {
  issueAccountProductLeaseJws,
  spkiThumbprint,
  verifyAccountProductLeaseJws,
} from "../providers/ed25519-account-product-lease";
import {
  createEd25519CommercialLeaseSigner,
  verifyCommercialLease,
  verifyCommercialLeaseEnvelope,
} from "../providers/ed25519-commercial-lease-signer";

function genEd25519() {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKeyPem: pair.publicKey.export({ format: "pem", type: "spki" }).toString(),
    thumbprint: spkiThumbprint(pair.publicKey),
  };
}

const interopGenerator = fileURLToPath(
  new URL("./lease-vectors/generate-interop-suite.cjs", import.meta.url),
);
const interopJson = execFileSync(process.execPath, [interopGenerator], { encoding: "utf8" });
const interopSuite = JSON.parse(interopJson) as {
  accountProductLease: {
    now: string;
    publicKeyPem: string;
    activeKid: string;
    retiredKid: string;
    expected: Omit<AccountProductLeaseVerificationContext, "now">;
    vectors: readonly { name: string; jws: string; accept: boolean; reason?: string }[];
  };
  commercialLease: {
    now: string;
    expected: Omit<CommercialLeaseVerificationContext, "now">;
    keys: readonly { keyId: string; publicKey: string; status: "ACTIVE" | "VERIFY_ONLY" | "RETIRED" | "REVOKED" }[];
    vectors: readonly {
      name: string;
      envelope: CommercialLeaseEnvelope;
      accept: boolean;
      reason?: string;
      disallowPublicTestKeys?: boolean;
    }[];
  };
  challengeProof: {
    now: string;
    agentPublicKeyPem: string;
    wrongAgentPublicKeyPem: string;
    record: {
      challengeId: string;
      accountId: string;
      userId: string;
      productId: string;
      agentSessionId: string;
      agentKeyThumbprint: string;
      action: "OPEN" | "USE";
      nonce: string;
      messageHash: string;
      createdAt: string;
      expiresAt: string;
    };
    validMessageBase64url: string;
    validSignatureBase64url: string;
    forgedSignatureBase64url: string;
  };
  activationModes: readonly { mode: string; credential: string; ok: boolean; reason?: string }[];
};

describe("ARGON adversarial security certification suite", () => {
  it("verifies all cross-language commercial lease interop vectors", () => {
    const keys = new Map<string, CommercialLeaseTrustedKey>(
      interopSuite.commercialLease.keys.map((k) => [k.keyId, { publicKey: k.publicKey, status: k.status }]),
    );
    const context: CommercialLeaseVerificationContext = {
      ...interopSuite.commercialLease.expected,
      now: new Date(interopSuite.commercialLease.now),
    };
    for (const vector of interopSuite.commercialLease.vectors) {
      const result = verifyCommercialLease(vector.envelope, keys, {
        ...context,
        disallowPublicTestKeys: vector.disallowPublicTestKeys,
      });
      expect(result.ok, `vector ${vector.name}`).toBe(vector.accept);
      if (!result.ok) {
        expect(result.reason, `vector ${vector.name}`).toBe(vector.reason);
      }
    }
  });

  it("rejects modified payload, forged signature, unknown/revoked signer, untrusted key substitution, alg confusion, duplicate JSON", () => {
    const signer = genEd25519();
    const attacker = genEd25519();
    const agent = genEd25519();
    const now = new Date("2026-11-15T12:00:00.000Z");

    const claims: AccountProductLeaseClaims = {
      schema: "bke.product-lease.v1",
      issuer: "BKE Digital Solutions",
      audience: "bke-product",
      leaseId: "adv-lease-01",
      accountId: "acct-1",
      userId: "user-1",
      productId: "render-dock",
      agentSessionId: "sess-1",
      agentKeyThumbprint: agent.thumbprint,
      keyProtection: "software",
      plan: "subscription",
      allowedActions: ["OPEN"],
      issuedAt: "2026-11-15T11:55:00.000Z",
      refreshAfter: "2026-11-15T11:58:00.000Z",
      expiresAt: "2026-11-15T12:05:00.000Z",
    };
    const kid = "prod-ephemeral-2026";
    const jws = issueAccountProductLeaseJws(claims, { kid, privateKeyPem: signer.privateKeyPem });
    const trust = new Map<string, AccountProductLeaseTrustedKey>([
      [kid, { publicKeyPem: signer.publicKeyPem, state: "ACTIVE" }],
      ["revoked-kid", { publicKeyPem: signer.publicKeyPem, state: "REVOKED" }],
    ]);
    const expected: AccountProductLeaseVerificationContext = {
      issuer: "BKE Digital Solutions",
      audience: "bke-product",
      accountId: "acct-1",
      userId: "user-1",
      productId: "render-dock",
      agentSessionId: "sess-1",
      agentKeyThumbprint: agent.thumbprint,
      action: "OPEN",
      now,
      disallowPublicTestKeys: true,
    };

    expect(verifyAccountProductLeaseJws(jws, trust, expected).ok).toBe(true);

    // Untrusted public-key substitution via inline jwk header
    const [h, p, s] = jws.split(".");
    const injectedHeader = Buffer.from(
      JSON.stringify({ alg: "EdDSA", kid, typ: "bke.product-lease.v1+jws", jwk: { kty: "OKP" } }),
    ).toString("base64url");
    expect(verifyAccountProductLeaseJws([injectedHeader, p, s].join("."), trust, expected)).toEqual({
      ok: false,
      reason: "MALFORMED_JWS",
    });

    // Algorithm confusion (alg: none / HS256)
    const algNoneHeader = Buffer.from(
      JSON.stringify({ alg: "none", kid, typ: "bke.product-lease.v1+jws" }),
    ).toString("base64url");
    expect(verifyAccountProductLeaseJws([algNoneHeader, p, s].join("."), trust, expected)).toEqual({
      ok: false,
      reason: "MALFORMED_JWS",
    });

    // Forged signature with attacker private key under legitimate kid
    const forged = issueAccountProductLeaseJws(claims, { kid, privateKeyPem: attacker.privateKeyPem });
    expect(verifyAccountProductLeaseJws(forged, trust, expected)).toEqual({
      ok: false,
      reason: "INVALID_SIGNATURE",
    });

    // Wrong account / user / product / session / action
    expect(verifyAccountProductLeaseJws(jws, trust, { ...expected, accountId: "acct-2" })).toEqual({
      ok: false,
      reason: "CLAIM_MISMATCH",
    });
    expect(verifyAccountProductLeaseJws(jws, trust, { ...expected, userId: "user-2" })).toEqual({
      ok: false,
      reason: "CLAIM_MISMATCH",
    });
    expect(verifyAccountProductLeaseJws(jws, trust, { ...expected, productId: "air-stack" })).toEqual({
      ok: false,
      reason: "CLAIM_MISMATCH",
    });
    expect(verifyAccountProductLeaseJws(jws, trust, { ...expected, agentSessionId: "sess-2" })).toEqual({
      ok: false,
      reason: "CLAIM_MISMATCH",
    });
    expect(verifyAccountProductLeaseJws(jws, trust, { ...expected, action: "USE" })).toEqual({
      ok: false,
      reason: "CLAIM_MISMATCH",
    });

    // Oversized / malformed input without secret leak
    const huge = `${h}.${p}.${"A".repeat(20_000)}`;
    expect(verifyAccountProductLeaseJws(huge, trust, expected)).toEqual({
      ok: false,
      reason: "MALFORMED_JWS",
    });
  });

  it("rejects public test fixture keys attempting production authority", () => {
    const seed = Buffer.alloc(32, 0x42);
    const testPriv = createPrivateKey({
      key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
      format: "der",
      type: "pkcs8",
    }).export({ format: "pem", type: "pkcs8" }).toString();

    const accountValidJws = interopSuite.accountProductLease.vectors[0]!.jws;
    const trust = new Map<string, AccountProductLeaseTrustedKey>([
      [interopSuite.accountProductLease.activeKid, {
        publicKeyPem: interopSuite.accountProductLease.publicKeyPem,
        state: "ACTIVE",
      }],
    ]);
    const strictContext: AccountProductLeaseVerificationContext = {
      ...interopSuite.accountProductLease.expected,
      now: new Date(interopSuite.accountProductLease.now),
      disallowPublicTestKeys: true,
    };
    expect(verifyAccountProductLeaseJws(accountValidJws, trust, strictContext)).toEqual({
      ok: false,
      reason: "UNTRUSTED_KID",
    });

    const claims = JSON.parse(Buffer.from(accountValidJws.split(".")[1]!, "base64url").toString("utf8")) as AccountProductLeaseClaims;
    expect(() =>
      issueAccountProductLeaseJws(claims, {
        kid: "prod-key-claiming-real",
        privateKeyPem: testPriv,
        disallowPublicTestKeys: true,
      }),
    ).toThrow("ACCOUNT_PRODUCT_LEASE_SIGNING_KEY_INVALID");
  });

  it("rejects replayed and concurrent duplicate one-time challenge consumption", async () => {
    const agent = genEd25519();
    const store = createInMemoryLeaseChallengeStore();
    const now = new Date("2026-11-15T12:00:00.000Z");

    const issued = await issueLeaseChallenge(store, {
      accountId: "acct-1",
      userId: "user-1",
      productId: "render-dock",
      agentSessionId: "sess-1",
      agentKeyThumbprint: agent.thumbprint,
      action: "OPEN",
      now,
    });
    const sig = signLeaseChallengeProof(issued.messageBase64url, agent.privateKeyPem);

    const runAttempt = () =>
      verifyAndConsumeLeaseChallengeProof(store, {
        challengeId: issued.record.challengeId,
        messageBase64url: issued.messageBase64url,
        signatureBase64url: sig,
        publicKeyPem: agent.publicKeyPem,
        expected: {
          accountId: "acct-1",
          userId: "user-1",
          productId: "render-dock",
          agentSessionId: "sess-1",
          agentKeyThumbprint: agent.thumbprint,
          action: "OPEN",
          now: new Date(now.getTime() + 1_000),
        },
      });

    const results = await Promise.all(Array.from({ length: 8 }, () => runAttempt()));
    const successes = results.filter((r) => r.ok);
    const replays = results.filter((r) => !r.ok && r.reason === "CHALLENGE_ALREADY_CONSUMED");
    expect(successes).toHaveLength(1);
    expect(replays).toHaveLength(7);

    // Verify interop vector challenge proof
    const interopStore = createInMemoryLeaseChallengeStore();
    await interopStore.issueChallenge({
      ...interopSuite.challengeProof.record,
      createdAt: new Date(interopSuite.challengeProof.record.createdAt),
      expiresAt: new Date(interopSuite.challengeProof.record.expiresAt),
      consumedAt: null,
    });
    const interopCheck = await verifyAndConsumeLeaseChallengeProof(interopStore, {
      challengeId: interopSuite.challengeProof.record.challengeId,
      messageBase64url: interopSuite.challengeProof.validMessageBase64url,
      signatureBase64url: interopSuite.challengeProof.validSignatureBase64url,
      publicKeyPem: interopSuite.challengeProof.agentPublicKeyPem,
      expected: {
        accountId: interopSuite.challengeProof.record.accountId,
        userId: interopSuite.challengeProof.record.userId,
        productId: interopSuite.challengeProof.record.productId,
        agentSessionId: interopSuite.challengeProof.record.agentSessionId,
        agentKeyThumbprint: interopSuite.challengeProof.record.agentKeyThumbprint,
        action: interopSuite.challengeProof.record.action,
        now: new Date(interopSuite.challengeProof.now),
      },
    });
    expect(interopCheck.ok).toBe(true);
  });

  it("enforces activation mode separation and rejects Claim Code as activation credential", () => {
    for (const v of interopSuite.activationModes) {
      const res = evaluateProductActivationMode(v.mode, v.credential);
      expect(res.ok).toBe(v.ok);
      if (!res.ok) expect(res.reason).toBe(v.reason);
      expect(allowsProductActivation(v.mode, v.credential)).toBe(v.ok);
    }
    expect(() =>
      assertSafeProductActivationModeChange({
        previousMode: "EITHER",
        requestedMode: "ACCOUNT",
        active: true,
        publishedAt: null,
        publishedEver: false,
        versionsCount: 0,
        licensesCount: 0,
        subscriptionsCount: 0,
        orderItemsCount: 0,
      }),
    ).toThrow("PRODUCT_ACTIVATION_MODE_LOCKED");
  });

  it("hardens commercial lease signer, replay validation, key mismatch, and AES-GCM decrypter", async () => {
    const k1 = genEd25519();
    const k2 = genEd25519();
    const now = new Date("2026-11-15T12:00:00.000Z");

    const payload: CommercialLeasePayload = {
      license_id: "lic-1",
      lease_id: "lease-1",
      generation: 1,
      server_revision: 1,
      product_id: "render-dock",
      installation_id: "install-1234",
      device_id: "device-identity-0001",
      version: "1.0.0",
      issuer: "BKE Digital Solutions",
      issued_at: now.toISOString(),
      not_before: now.toISOString(),
      expires_at: new Date(now.getTime() + 60_000).toISOString(),
      key_id: "k1",
      algorithm: "Ed25519",
      revoked: false,
      superseded_by: null,
    };

    const signer = createEd25519CommercialLeaseSigner({ resolve: () => k1.privateKeyPem });
    // Mismatched publicKey vs privateKey must fail closed
    await expect(
      signer.issue(payload, {
        id: "rec-1",
        keyId: "k1",
        algorithm: "Ed25519",
        status: "ACTIVE",
        publicKey: k2.publicKeyPem,
        privateKeyReference: "env:K1",
        createdAt: now,
        activatedAt: now,
        retiredAt: null,
        rotationReason: null,
        createdBy: null,
      }),
    ).rejects.toThrow("COMMERCIAL_SIGNING_KEY_MISMATCH");

    // Non-canonical base64 signature rejected
    const goodEnv = await signer.issue(payload, {
      id: "rec-1",
      keyId: "k1",
      algorithm: "Ed25519",
      status: "ACTIVE",
      publicKey: k1.publicKeyPem,
      privateKeyReference: "env:K1",
      createdAt: now,
      activatedAt: now,
      retiredAt: null,
      rotationReason: null,
      createdBy: null,
    });
    expect(verifyCommercialLeaseEnvelope(goodEnv, k1.publicKeyPem)).toBe(true);
    expect(
      verifyCommercialLeaseEnvelope(
        { ...goodEnv, signature: goodEnv.signature.replace(/=+$/, "") },
        k1.publicKeyPem,
      ),
    ).toBe(false);

    // AES-GCM decrypter rejects truncated auth tag without leaking pepper
    const pepper = "super-secret-pepper-value";
    const decrypter = createAesGcmLicensingLicenseKeyDecrypter(pepper);
    const encKey = createHash("sha256").update(pepper).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encKey, iv);
    const encrypted = Buffer.concat([cipher.update("BKE-KEY-1234", "utf8"), cipher.final()]);
    const shortTag = cipher.getAuthTag().subarray(0, 4);
    const forgedCiphertext = [iv, shortTag, encrypted].map((b) => b.toString("base64url")).join(".");
    expect(() => decrypter.decrypt(forgedCiphertext)).toThrow("INVALID_CIPHERTEXT");
    try {
      decrypter.decrypt(forgedCiphertext);
    } catch (err) {
      expect(String(err)).not.toContain(pepper);
    }

    // Completed commercial operation replay refuses different device/installation/version
    const ops = new Map<string, { id: string; operationId: string; licenseId: string; action: string; status: string; resultLeaseId: string | null; metadata: Record<string, unknown> }>();
    const leases = new Map<string, { id: string; licenseId: string; leaseId: string; generation: number; serverRevision: number; installationId: string; deviceId: string; version: string; status: string; action: string; operationId: string; signerKeyId: string; expiresAt: Date; leasePayload: string; leaseSignature: string; supersededById: string | null; issuedAt: Date }>();
    const capability = createCommercialLeaseCapability({
      store: {
        async withTransaction(work) {
          return work({
            async findOperation(operationId) { return ops.get(operationId) ?? null; },
            async createOperation(inp) {
              const rec = { ...inp, status: "PENDING", resultLeaseId: null, metadata: {} };
              ops.set(inp.operationId, rec);
              return rec;
            },
            async completeOperation(inp) {
              const cur = ops.get(inp.operationId)!;
              ops.set(inp.operationId, { ...cur, status: "COMPLETED", resultLeaseId: inp.resultLeaseId });
            },
            async findLease(leaseId) { return leases.get(leaseId) ?? null; },
            async findLatestLease() { return null; },
            async findActivationByDeviceHash() { return null; },
            async countActiveActivations() { return 0; },
            async upsertActivation(inp) {
              return { id: inp.id, licenseId: inp.licenseId, deviceHash: inp.deviceHash, machineIdHint: inp.machineIdHint, label: null, operatingSystem: null, architecture: null, active: true };
            },
            async touchActivation() { throw new Error("unexpected"); },
            async createLease(inp) {
              const rec = { ...inp, status: "ACTIVE", supersededById: null };
              leases.set(inp.leaseId, rec);
              return rec;
            },
            async supersedeLease() {},
          });
        },
      },
      contexts: {
        async resolve() {
          return {
            licenseId: "lic-1",
            orderItemId: "oi-1",
            licenseStatus: "ACTIVE",
            licenseExpiresAt: null,
            accountLifecycleState: "ACTIVE",
            subscriptionStatus: "ACTIVE",
            productId: "render-dock",
            productVersionEligible: true,
            minimumAcceptedVersion: null,
            maximumAcceptedVersion: null,
            maxSeats: 1,
            maxDevicesPerSeat: 2,
          };
        },
      },
      keys: {
        async ensure() {},
        async active() {
          return {
            id: "rec-1",
            keyId: "k1",
            algorithm: "Ed25519",
            status: "ACTIVE",
            publicKey: k1.publicKeyPem,
            privateKeyReference: "env:K1",
            createdAt: now,
            activatedAt: now,
            retiredAt: null,
            rotationReason: null,
            createdBy: null,
          };
        },
      },
      signer,
      hasher: { hash: (v) => createHash("sha256").update(v).digest("hex") },
      transfers: { async isTransferAllowed() { return false; } },
    });

    const req = {
      licenseKey: "BKE-LIVE-TEST-KEY-0001",
      installationId: "install-alpha-0001",
      deviceId: "device-alpha-00000001",
      operationId: "op-replay-123456",
      productVersion: "1.0.0",
      action: "ACTIVATION" as const,
      now,
    };
    const issuedLease = await capability.issue(req);
    expect((await capability.issue(req)).lease).toEqual(issuedLease.lease);
    await expect(
      capability.issue({ ...req, deviceId: "device-attacker-000001" }),
    ).rejects.toThrow("OPERATION_INPUT_MISMATCH");
    await expect(
      capability.issue({ ...req, action: "REFRESH" }),
    ).rejects.toThrow("OPERATION_ACTION_MISMATCH");

    // Grace period fails closed when persistence throws
    const grace = createLicensingGracePeriodCapability({
      store: {
        async findState() { throw new Error("PG_UNAVAILABLE"); },
        async findStates() { throw new Error("PG_UNAVAILABLE"); },
        async withTransaction() { throw new Error("PG_UNAVAILABLE"); },
      },
      mutationEffect: { async record() {} },
    });
    expect(await grace.readState("renderdock")).toBe(false);

    // Missing repository state in key reveal fails closed
    const reveal = createLicensingLicenseKeyRevealCapability({
      repository: {
        async findByIdAndAccount() { return null; },
        async recordSuccessfulReveal() { return { status: "NOT_FOUND" }; },
      },
      decrypter,
      clock: { now: () => now },
    });
    expect(
      await reveal.reveal({ licenseId: "  ", accountId: "acct-1", actorPrincipalId: "user-1" }),
    ).toEqual({ status: "REJECTED", code: "NOT_FOUND" });
  });
});
