// CANONICAL CROSS-LANGUAGE INTEROP SUITE GENERATOR (v1)
// Synthetic PUBLIC TEST-ONLY keys only; never use for production.
const {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} = require("node:crypto");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const accountVectorsRaw = execFileSync(
  process.execPath,
  [path.join(__dirname, "generate.cjs")],
  { encoding: "utf8" },
);
const accountVectors = JSON.parse(accountVectorsRaw);

// Deterministic commercial test-only Ed25519 keys (different from 0x42 seed)
function ed25519FromSeedByte(byte) {
  const seed = Buffer.alloc(32, byte);
  const privateKey = createPrivateKey({
    key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(privateKey);
  return {
    privateKey,
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey,
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    spkiThumbprint: createHash("sha256")
      .update(publicKey.export({ format: "der", type: "spki" }))
      .digest("base64url"),
  };
}

const commercialActive = ed25519FromSeedByte(0x51);
const commercialVerifyOnly = ed25519FromSeedByte(0x52);
const commercialRevoked = ed25519FromSeedByte(0x53);
const rogueSigner = ed25519FromSeedByte(0x54);
const publicTestFixture = ed25519FromSeedByte(0x42);

const commercialExpected = {
  issuer: "BKE Digital Solutions",
  productId: "render-dock",
  installationId: "install-interop-001",
  deviceId: "device-interop-0001",
  version: "2.4.1",
  now: "2026-11-11T02:00:00.000Z",
};

const baseCommercialPayload = {
  license_id: "lic-interop-001",
  lease_id: "lease-interop-001",
  generation: 1,
  server_revision: 1,
  product_id: commercialExpected.productId,
  installation_id: commercialExpected.installationId,
  device_id: commercialExpected.deviceId,
  version: commercialExpected.version,
  issuer: commercialExpected.issuer,
  issued_at: "2026-11-11T00:00:00.000Z",
  not_before: "2026-11-11T00:00:00.000Z",
  expires_at: "2026-12-11T00:00:00.000Z",
  key_id: "comm-active-2026",
  algorithm: "Ed25519",
  revoked: false,
  superseded_by: null,
};

function canonicalJson(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function signCommercialPayload(rawPayload, keyId, privateKey) {
  const sig = sign(null, Buffer.from(rawPayload, "utf8"), privateKey).toString("base64");
  return {
    payload: rawPayload,
    signature: sig,
    key_id: keyId,
    algorithm: "Ed25519",
  };
}

function signCommercial(overrides = {}, keyId = "comm-active-2026", privateKey = commercialActive.privateKey) {
  const merged = { ...baseCommercialPayload, key_id: keyId, ...overrides };
  return signCommercialPayload(canonicalJson(merged), keyId, privateKey);
}

const validCommercial = signCommercial();
const rotatedVerifyOnly = signCommercial({}, "comm-verify-only-2025", commercialVerifyOnly.privateKey);
const tamperedCommercial = {
  ...validCommercial,
  payload: canonicalJson({ ...baseCommercialPayload, product_id: "air-stack" }),
};
const forgedCommercial = signCommercial({}, "comm-active-2026", rogueSigner.privateKey);
const nonCanonicalB64Sig = {
  ...validCommercial,
  signature: validCommercial.signature.replace(/=+$/, ""),
};
const duplicatePayloadRaw = canonicalJson(baseCommercialPayload).replace(
  '"product_id":"render-dock"',
  '"product\\u005fid":"air-stack","product_id":"render-dock"',
);
const bomPayloadBytes = Buffer.concat([
  Buffer.from([0xef, 0xbb, 0xbf]),
  Buffer.from(canonicalJson(baseCommercialPayload), "utf8"),
]).toString("utf8");

const commercialVectors = [
  { name: "valid-active", envelope: validCommercial, accept: true },
  { name: "valid-verify-only-rotation", envelope: rotatedVerifyOnly, accept: true },
  { name: "tampered-payload", envelope: tamperedCommercial, accept: false, reason: "INVALID_SIGNATURE" },
  { name: "forged-signature", envelope: forgedCommercial, accept: false, reason: "INVALID_SIGNATURE" },
  { name: "non-canonical-base64", envelope: nonCanonicalB64Sig, accept: false, reason: "MALFORMED_ENVELOPE" },
  { name: "unknown-key-id", envelope: signCommercial({}, "comm-unknown-999", commercialActive.privateKey), accept: false, reason: "UNTRUSTED_KEY_ID" },
  { name: "revoked-key-id", envelope: signCommercial({}, "comm-revoked-2024", commercialRevoked.privateKey), accept: false, reason: "UNTRUSTED_KEY_ID" },
  { name: "duplicate-json-field", envelope: signCommercialPayload(duplicatePayloadRaw, "comm-active-2026", commercialActive.privateKey), accept: false, reason: "INVALID_PAYLOAD" },
  { name: "bom-payload", envelope: signCommercialPayload(bomPayloadBytes, "comm-active-2026", commercialActive.privateKey), accept: false, reason: "INVALID_PAYLOAD" },
  { name: "revoked-lease-flag", envelope: signCommercial({ revoked: true }), accept: false, reason: "LEASE_REVOKED" },
  { name: "superseded-lease", envelope: signCommercial({ superseded_by: "lease-interop-002" }), accept: false, reason: "LEASE_SUPERSEDED" },
  { name: "wrong-product", envelope: signCommercial({ product_id: "air-stack" }), accept: false, reason: "SCOPE_MISMATCH" },
  { name: "wrong-installation", envelope: signCommercial({ installation_id: "other-install" }), accept: false, reason: "SCOPE_MISMATCH" },
  { name: "wrong-device", envelope: signCommercial({ device_id: "other-device-0002" }), accept: false, reason: "SCOPE_MISMATCH" },
  { name: "wrong-version", envelope: signCommercial({ version: "9.9.9" }), accept: false, reason: "SCOPE_MISMATCH" },
  { name: "expired", envelope: signCommercial({ issued_at: "2026-10-01T00:00:00.000Z", not_before: "2026-10-01T00:00:00.000Z", expires_at: "2026-11-10T00:00:00.000Z" }), accept: false, reason: "EXPIRED" },
  { name: "future-issued-at", envelope: signCommercial({ issued_at: "2026-11-12T00:00:00.000Z", not_before: "2026-11-12T00:00:00.000Z", expires_at: "2026-12-12T00:00:00.000Z" }), accept: false, reason: "FUTURE_ISSUED_AT" },
  { name: "not-yet-valid", envelope: signCommercial({ issued_at: "2026-11-11T00:00:00.000Z", not_before: "2026-11-12T00:00:00.000Z", expires_at: "2026-12-12T00:00:00.000Z" }), accept: false, reason: "NOT_YET_VALID" },
  { name: "public-test-key-rejected-in-strict-mode", envelope: signCommercial({}, "test-ed25519-2026", publicTestFixture.privateKey), accept: false, reason: "UNTRUSTED_KEY_ID", disallowPublicTestKeys: true },
];

// Challenge proof vectors
const agentDevice = ed25519FromSeedByte(0x61);
const wrongAgentDevice = ed25519FromSeedByte(0x62);
const challengeRecord = {
  challengeId: "challenge-interop-001",
  accountId: "account-test",
  userId: "user-test",
  productId: "render-dock",
  agentSessionId: "agent-session-test",
  agentKeyThumbprint: agentDevice.spkiThumbprint,
  action: "OPEN",
  nonce: "interop-nonce-0123456789abcdef0123",
  createdAt: "2026-11-11T01:59:45.000Z",
  expiresAt: "2026-11-11T02:00:15.000Z",
};
const challengeMsg = [
  "bke.lease-challenge.v1",
  challengeRecord.challengeId,
  challengeRecord.accountId,
  challengeRecord.userId,
  challengeRecord.productId,
  challengeRecord.agentSessionId,
  challengeRecord.agentKeyThumbprint,
  challengeRecord.action,
  challengeRecord.nonce,
].join("\n");
const challengeMsgBytes = Buffer.from(challengeMsg, "utf8");
const challengeMsgB64 = challengeMsgBytes.toString("base64url");
const challengeMsgHash = createHash("sha256").update(challengeMsgBytes).digest("hex");
const validChallengeSig = sign(null, challengeMsgBytes, agentDevice.privateKey).toString("base64url");
const forgedChallengeSig = sign(null, challengeMsgBytes, wrongAgentDevice.privateKey).toString("base64url");

const activationModeVectors = [
  { mode: "ACCOUNT", credential: "ACCOUNT", ok: true },
  { mode: "ACCOUNT", credential: "LICENSE_KEY", ok: false, reason: "ACTIVATION_MODE_MISMATCH" },
  { mode: "LICENSE_KEY", credential: "LICENSE_KEY", ok: true },
  { mode: "LICENSE_KEY", credential: "ACCOUNT", ok: false, reason: "ACTIVATION_MODE_MISMATCH" },
  { mode: "EITHER", credential: "ACCOUNT", ok: true },
  { mode: "EITHER", credential: "LICENSE_KEY", ok: true },
  { mode: "EITHER", credential: "CLAIM_CODE", ok: false, reason: "CLAIM_CODE_NOT_ACTIVATION_CREDENTIAL" },
  { mode: "UNKNOWN", credential: "ACCOUNT", ok: false, reason: "INVALID_ACTIVATION_MODE" },
];

const suite = {
  schema: "bke.licensing-interop-suite.v1",
  description: "SYNTHETIC PUBLIC TEST KEYS ONLY. Cross-language certification vectors.",
  accountProductLease: accountVectors,
  commercialLease: {
    now: commercialExpected.now,
    expected: {
      issuer: commercialExpected.issuer,
      productId: commercialExpected.productId,
      installationId: commercialExpected.installationId,
      deviceId: commercialExpected.deviceId,
      version: commercialExpected.version,
    },
    keys: [
      { keyId: "comm-active-2026", publicKey: commercialActive.publicKeyPem, status: "ACTIVE" },
      { keyId: "comm-verify-only-2025", publicKey: commercialVerifyOnly.publicKeyPem, status: "VERIFY_ONLY" },
      { keyId: "comm-revoked-2024", publicKey: commercialRevoked.publicKeyPem, status: "REVOKED" },
      { keyId: "test-ed25519-2026", publicKey: publicTestFixture.publicKeyPem, status: "ACTIVE" },
    ],
    vectors: commercialVectors,
  },
  challengeProof: {
    now: "2026-11-11T02:00:00.000Z",
    agentPublicKeyPem: agentDevice.publicKeyPem,
    wrongAgentPublicKeyPem: wrongAgentDevice.publicKeyPem,
    record: { ...challengeRecord, messageHash: challengeMsgHash },
    validMessageBase64url: challengeMsgB64,
    validSignatureBase64url: validChallengeSig,
    forgedSignatureBase64url: forgedChallengeSig,
  },
  activationModes: activationModeVectors,
};

console.log(JSON.stringify(suite, null, 2));
