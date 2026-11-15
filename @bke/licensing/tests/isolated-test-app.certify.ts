import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { ACCOUNT_PRODUCT_LEASE_SCHEMA } from "../contracts/account-product-lease.contract";
import type {
  CommercialLeaseEnvelope,
  CommercialLeasePayload,
  CommercialLeaseTrustedKey,
} from "../contracts/commercial-lease.contract";
import {
  assertSafeProductActivationModeChange,
  evaluateProductActivationMode,
} from "../logic/activation-mode-policy";
import { createCommercialLeaseCapability } from "../logic/commercial-lease";
import type {
  CommercialActivationRecord,
  CommercialLeaseRecord,
  CommercialOperationRecord,
} from "../logic/commercial-lease-ports";
import type { CommercialSigningKeyRecord } from "../logic/commercial-signing-registry";
import {
  createInMemoryLeaseChallengeStore,
  issueLeaseChallenge,
  signLeaseChallengeProof,
  verifyAndConsumeLeaseChallengeProof,
} from "../logic/lease-challenge-proof";
import {
  issueAccountProductLeaseJws,
  spkiThumbprint,
  verifyAccountProductLeaseJws,
} from "../providers/ed25519-account-product-lease";
import {
  createEd25519CommercialLeaseSigner,
  verifyCommercialLease,
} from "../providers/ed25519-commercial-lease-signer";

function generateEd25519PemPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    thumbprint: spkiThumbprint(publicKey),
  };
}

async function runIsolatedTestApp(): Promise<void> {
  const now = new Date("2026-11-15T12:00:00.000Z");
  const issuer = "https://auth.test-only.bke.example";
  const audience = "bke-desktop-test-app";
  const accountId = "acct_test_001";
  const userId = "usr_test_001";
  const productAccountOnly = "prod_suite_pro";
  const productEither = "prod_render_dock";
  const productKeyOnly = "prod_standalone_fx";
  const agentSessionId = "sess_test_001";

  const authorityPrimary = generateEd25519PemPair();
  const authorityAttacker = generateEd25519PemPair();
  const agentDeviceKey = generateEd25519PemPair();

  const accountKeys = new Map([
    ["test-authority-k1", { publicKeyPem: authorityPrimary.publicKeyPem, state: "ACTIVE" as const }],
  ]);

  // Positive 1: One-time challenge issuance + agent PoP + legitimate ACCOUNT lease issuance & verification.
  const challengeStore = createInMemoryLeaseChallengeStore();
  const challenge = await issueLeaseChallenge(challengeStore, {
    challengeId: `chg_${randomUUID()}`,
    accountId,
    userId,
    productId: productEither,
    agentSessionId,
    agentKeyThumbprint: agentDeviceKey.thumbprint,
    action: "OPEN",
    now,
  });
  const popSignature = signLeaseChallengeProof(challenge.messageBase64url, agentDeviceKey.privateKeyPem);
  const popVerified = await verifyAndConsumeLeaseChallengeProof(challengeStore, {
    challengeId: challenge.record.challengeId,
    messageBase64url: challenge.messageBase64url,
    signatureBase64url: popSignature,
    publicKeyPem: agentDeviceKey.publicKeyPem,
    expected: {
      accountId,
      userId,
      productId: productEither,
      agentSessionId,
      agentKeyThumbprint: agentDeviceKey.thumbprint,
      action: "OPEN",
      now,
    },
  });
  assert.equal(popVerified.ok, true);

  assert.deepEqual(evaluateProductActivationMode("EITHER", "ACCOUNT"), {
    ok: true,
    mode: "EITHER",
    credential: "ACCOUNT",
  });

  const issuedAccountJws = issueAccountProductLeaseJws(
    {
      schema: ACCOUNT_PRODUCT_LEASE_SCHEMA,
      issuer,
      audience,
      leaseId: "lease_acct_test_001",
      accountId,
      userId,
      productId: productEither,
      agentSessionId,
      agentKeyThumbprint: agentDeviceKey.thumbprint,
      keyProtection: "tpm",
      plan: "PRO",
      allowedActions: ["OPEN", "USE"],
      issuedAt: "2026-11-15T11:55:00.000Z",
      refreshAfter: "2026-11-15T18:00:00.000Z",
      expiresAt: "2026-11-16T12:00:00.000Z",
    },
    { kid: "test-authority-k1", privateKeyPem: authorityPrimary.privateKeyPem },
  );

  const accountVerification = verifyAccountProductLeaseJws(issuedAccountJws, accountKeys, {
    issuer,
    audience,
    accountId,
    userId,
    productId: productEither,
    agentSessionId,
    agentKeyThumbprint: agentDeviceKey.thumbprint,
    action: "OPEN",
    now,
  });
  assert.equal(accountVerification.ok, true);
  if (accountVerification.ok) {
    assert.equal(accountVerification.claims.accountId, accountId);
    assert.equal(accountVerification.claims.productId, productEither);
    assert.equal(accountVerification.claims.expiresAt, "2026-11-16T12:00:00.000Z");
  }

  // Positive 2: Independently authorized LICENSE_KEY commercial lease under EITHER and LICENSE_KEY modes.
  assert.deepEqual(evaluateProductActivationMode("EITHER", "LICENSE_KEY"), {
    ok: true,
    mode: "EITHER",
    credential: "LICENSE_KEY",
  });
  assert.deepEqual(evaluateProductActivationMode("LICENSE_KEY", "LICENSE_KEY"), {
    ok: true,
    mode: "LICENSE_KEY",
    credential: "LICENSE_KEY",
  });

  const commercialKeyId = "comm-test-k1";
  const signingKeyRecord: CommercialSigningKeyRecord = {
    id: "key_rec_test_001",
    keyId: commercialKeyId,
    algorithm: "Ed25519",
    status: "ACTIVE",
    publicKey: authorityPrimary.publicKeyPem,
    privateKeyReference: "env:TEST_COMM_KEY",
    createdAt: now,
    activatedAt: now,
    retiredAt: null,
    rotationReason: null,
    createdBy: "isolated-test-app",
  };
  const commercialSigner = createEd25519CommercialLeaseSigner({
    resolve: (ref) => {
      assert.equal(ref, "env:TEST_COMM_KEY");
      return authorityPrimary.privateKeyPem;
    },
  });
  const commercialKeyHash = createHash("sha256").update("BKE-TEST-LICENSE-KEY-001", "utf8").digest("hex");

  const ops = new Map<string, CommercialOperationRecord>();
  const leases = new Map<string, CommercialLeaseRecord>();
  const activations = new Map<string, CommercialActivationRecord>();
  const capability = createCommercialLeaseCapability({
    store: {
      async withTransaction(work) {
        return work({
          async findOperation(operationId) {
            return ops.get(operationId) ?? null;
          },
          async createOperation(input) {
            const record: CommercialOperationRecord = {
              id: input.id,
              operationId: input.operationId,
              licenseId: input.licenseId,
              action: input.action,
              status: "PENDING",
              resultLeaseId: null,
              metadata: {},
            };
            ops.set(input.operationId, record);
            return record;
          },
          async completeOperation(input) {
            const existing = ops.get(input.operationId);
            if (existing) {
              ops.set(input.operationId, {
                ...existing,
                status: "COMPLETED",
                resultLeaseId: input.resultLeaseId,
              });
            }
          },
          async findLease(leaseId) {
            return leases.get(leaseId) ?? null;
          },
          async findLatestLease(input) {
            for (const lease of leases.values()) {
              if (
                lease.licenseId === input.licenseId &&
                lease.installationId === input.installationId &&
                lease.deviceId === input.deviceId &&
                lease.status === "ACTIVE"
              ) {
                return lease;
              }
            }
            return null;
          },
          async findActivationByDeviceHash(licenseId, deviceHash) {
            return activations.get(`${licenseId}:${deviceHash}`) ?? null;
          },
          async countActiveActivations(licenseId) {
            let count = 0;
            for (const act of activations.values()) {
              if (act.licenseId === licenseId && act.active) count++;
            }
            return count;
          },
          async upsertActivation(input) {
            const record: CommercialActivationRecord = {
              id: input.id,
              licenseId: input.licenseId,
              deviceHash: input.deviceHash,
              machineIdHint: input.machineIdHint,
              label: input.label ?? null,
              operatingSystem: input.operatingSystem ?? null,
              architecture: input.architecture ?? null,
              active: true,
            };
            activations.set(`${input.licenseId}:${input.deviceHash}`, record);
            return record;
          },
          async touchActivation(input) {
            for (const [k, act] of activations.entries()) {
              if (act.id === input.id) {
                const updated = { ...act, label: input.label ?? act.label };
                activations.set(k, updated);
                return updated;
              }
            }
            throw new Error("ACTIVATION_NOT_FOUND");
          },
          async createLease(input) {
            const record: CommercialLeaseRecord = {
              ...input,
              status: "ACTIVE",
              supersededById: null,
            };
            leases.set(input.leaseId, record);
            return record;
          },
          async supersedeLease(input) {
            for (const [k, lease] of leases.entries()) {
              if (lease.id === input.previousLeaseRecordId) {
                leases.set(k, { ...lease, status: "SUPERSEDED", supersededById: input.supersededById });
              }
            }
          },
        });
      },
    },
    contexts: {
      async resolve(input) {
        if (input.licenseKeyHash !== commercialKeyHash) return null;
        return {
          licenseId: "lic_test_001",
          orderItemId: "oi_test_001",
          licenseStatus: "ACTIVE",
          licenseExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
          accountLifecycleState: "ACTIVE",
          subscriptionStatus: null,
          productId: productKeyOnly,
          productVersionEligible: true,
          minimumAcceptedVersion: "1.0.0",
          maximumAcceptedVersion: "2.0.0",
          maxSeats: 2,
          maxDevicesPerSeat: 2,
        };
      },
    },
    keys: {
      async ensure() {},
      async active() {
        return signingKeyRecord;
      },
    },
    signer: commercialSigner,
    hasher: {
      hash(licenseKey) {
        return createHash("sha256").update(licenseKey, "utf8").digest("hex");
      },
    },
    transfers: {
      async isTransferAllowed() {
        return false;
      },
    },
  });

  const commercialIssued = await capability.issue({
    licenseKey: "BKE-TEST-LICENSE-KEY-001",
    installationId: "inst_test_device_0001",
    deviceId: "dev_test_machine_0001",
    operationId: "op_test_activate_001",
    productVersion: "1.2.0",
    action: "ACTIVATION",
    now,
  });

  const commercialTrustedKeys = new Map<string, CommercialLeaseTrustedKey>([
    [commercialKeyId, { publicKey: authorityPrimary.publicKeyPem, status: "ACTIVE" }],
  ]);

  const commercialVerified = verifyCommercialLease(commercialIssued.lease, commercialTrustedKeys, {
    issuer: "BKE Digital Solutions",
    productId: productKeyOnly,
    installationId: "inst_test_device_0001",
    deviceId: "dev_test_machine_0001",
    version: "1.2.0",
    now: new Date("2026-11-15T12:05:00.000Z"),
  });
  assert.equal(commercialVerified.ok, true);
  if (commercialVerified.ok) {
    assert.equal(commercialVerified.payload.product_id, productKeyOnly);
    assert.equal(commercialVerified.payload.license_id, "lic_test_001");
  }

  // Negative 1: Tamper with authorization bytes (JWS payload and commercial lease payload).
  const [jwsHdr, jwsPay, jwsSig] = issuedAccountJws.split(".");
  const tamperedClaims = JSON.parse(Buffer.from(jwsPay, "base64url").toString("utf8")) as Record<string, unknown>;
  tamperedClaims.productId = productAccountOnly;
  const tamperedJws = `${jwsHdr}.${Buffer.from(JSON.stringify(tamperedClaims), "utf8").toString("base64url")}.${jwsSig}`;
  assert.deepEqual(
    verifyAccountProductLeaseJws(tamperedJws, accountKeys, {
      issuer,
      audience,
      accountId,
      userId,
      productId: productAccountOnly,
      agentSessionId,
      agentKeyThumbprint: agentDeviceKey.thumbprint,
      action: "OPEN",
      now,
    }),
    { ok: false, reason: "INVALID_SIGNATURE" },
  );

  const tamperedCommercial: CommercialLeaseEnvelope = {
    ...commercialIssued.lease,
    payload: commercialIssued.lease.payload.replace("1.2.0", "1.2.1"),
  };
  assert.deepEqual(
    verifyCommercialLease(tamperedCommercial, commercialTrustedKeys, {
      issuer: "BKE Digital Solutions",
      productId: productKeyOnly,
      installationId: "inst_test_device_0001",
      deviceId: "dev_test_machine_0001",
      version: "1.2.1",
      now,
    }),
    { ok: false, reason: "INVALID_SIGNATURE" },
  );

  // Negative 2: Replace trusted signer identity / unknown kid.
  const attackerJws = issueAccountProductLeaseJws(
    {
      schema: ACCOUNT_PRODUCT_LEASE_SCHEMA,
      issuer,
      audience,
      leaseId: "lease_attacker_001",
      accountId,
      userId,
      productId: productEither,
      agentSessionId,
      agentKeyThumbprint: agentDeviceKey.thumbprint,
      keyProtection: "tpm",
      plan: "PRO",
      allowedActions: ["OPEN"],
      issuedAt: "2026-11-15T11:55:00.000Z",
      refreshAfter: "2026-11-15T18:00:00.000Z",
      expiresAt: "2026-11-16T12:00:00.000Z",
    },
    { kid: "attacker-kid", privateKeyPem: authorityAttacker.privateKeyPem },
  );
  assert.deepEqual(
    verifyAccountProductLeaseJws(attackerJws, accountKeys, {
      issuer,
      audience,
      accountId,
      userId,
      productId: productEither,
      agentSessionId,
      agentKeyThumbprint: agentDeviceKey.thumbprint,
      action: "OPEN",
      now,
    }),
    { ok: false, reason: "UNTRUSTED_KID" },
  );

  // Negative 3: Attempt cross-product authorization.
  assert.deepEqual(
    verifyAccountProductLeaseJws(issuedAccountJws, accountKeys, {
      issuer,
      audience,
      accountId,
      userId,
      productId: productAccountOnly,
      agentSessionId,
      agentKeyThumbprint: agentDeviceKey.thumbprint,
      action: "OPEN",
      now,
    }),
    { ok: false, reason: "CLAIM_MISMATCH" },
  );
  assert.deepEqual(
    verifyCommercialLease(commercialIssued.lease, commercialTrustedKeys, {
      issuer: "BKE Digital Solutions",
      productId: productEither,
      installationId: "inst_test_device_0001",
      deviceId: "dev_test_machine_0001",
      version: "1.2.0",
      now,
    }),
    { ok: false, reason: "SCOPE_MISMATCH" },
  );

  // Negative 4: Reuse a consumed one-time PoP challenge.
  const replay = await verifyAndConsumeLeaseChallengeProof(challengeStore, {
    challengeId: challenge.record.challengeId,
    messageBase64url: challenge.messageBase64url,
    signatureBase64url: popSignature,
    publicKeyPem: agentDeviceKey.publicKeyPem,
    expected: {
      accountId,
      userId,
      productId: productEither,
      agentSessionId,
      agentKeyThumbprint: agentDeviceKey.thumbprint,
      action: "OPEN",
      now,
    },
  });
  assert.deepEqual(replay, { ok: false, reason: "CHALLENGE_ALREADY_CONSUMED" });

  // Negative 5: Expired, revoked, and activation-mode mismatched checks.
  assert.deepEqual(
    verifyAccountProductLeaseJws(issuedAccountJws, accountKeys, {
      issuer,
      audience,
      accountId,
      userId,
      productId: productEither,
      agentSessionId,
      agentKeyThumbprint: agentDeviceKey.thumbprint,
      action: "OPEN",
      now: new Date("2026-11-16T12:00:00.000Z"),
    }),
    { ok: false, reason: "EXPIRED" },
  );

  const revokedCommercialPayload: CommercialLeasePayload = {
    ...(commercialVerified.ok ? commercialVerified.payload : (() => { throw new Error("unreachable"); })()),
    revoked: true,
  };
  const revokedSigned = await commercialSigner.issue(revokedCommercialPayload, signingKeyRecord);
  assert.deepEqual(
    verifyCommercialLease(revokedSigned, commercialTrustedKeys, {
      issuer: "BKE Digital Solutions",
      productId: productKeyOnly,
      installationId: "inst_test_device_0001",
      deviceId: "dev_test_machine_0001",
      version: "1.2.0",
      now,
    }),
    { ok: false, reason: "LEASE_REVOKED" },
  );

  assert.deepEqual(evaluateProductActivationMode("ACCOUNT", "LICENSE_KEY"), {
    ok: false,
    reason: "ACTIVATION_MODE_MISMATCH",
  });
  assert.deepEqual(evaluateProductActivationMode("LICENSE_KEY", "CLAIM_CODE"), {
    ok: false,
    reason: "CLAIM_CODE_NOT_ACTIVATION_CREDENTIAL",
  });
  assert.throws(() =>
    assertSafeProductActivationModeChange({
      previousMode: "ACCOUNT",
      requestedMode: "LICENSE_KEY",
      active: false,
      publishedAt: null,
      publishedEver: false,
      versionsCount: 0,
      licensesCount: 1,
      subscriptionsCount: 0,
      orderItemsCount: 0,
    }),
  );

  console.log("ISOLATED_LICENSING_TEST_APP: ALL_POSITIVE_AND_NEGATIVE_SCENARIOS_VERIFIED");
}

void runIsolatedTestApp();
