import {
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import type {
  CommercialLeaseEnvelope,
  CommercialLeasePayload,
  CommercialLeaseTrustedKey,
  CommercialLeaseVerificationContext,
  CommercialLeaseVerificationFailureReason,
  CommercialLeaseVerificationResult,
} from "../contracts/commercial-lease.contract";
import type { CommercialLeaseSigner } from "../logic/commercial-lease-ports";
import type { CommercialSigningKeyRecord } from "../logic/commercial-signing-registry";
import { isPublicTestFixtureKey, parseUnambiguousJson } from "./ed25519-account-product-lease";

export interface CommercialPrivateKeyResolver {
  resolve(reference: string): Promise<string> | string;
}

const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const CANONICAL_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const PAYLOAD_FIELDS = [
  "license_id",
  "lease_id",
  "generation",
  "server_revision",
  "product_id",
  "installation_id",
  "device_id",
  "version",
  "issuer",
  "issued_at",
  "not_before",
  "expires_at",
  "key_id",
  "algorithm",
  "revoked",
  "superseded_by",
] as const;

function keyMaterial(value: string): string {
  return value.includes("BEGIN") ? value : Buffer.from(value, "base64").toString("utf8");
}

function canonicalPayload(payload: CommercialLeasePayload): Buffer {
  return Buffer.from(JSON.stringify(payload, Object.keys(payload).sort()), "utf8");
}

function decodeCanonicalBase64(value: string, expectedLength: number): Buffer | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    value.length % 4 !== 0 ||
    !CANONICAL_BASE64.test(value)
  ) {
    return null;
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== expectedLength || decoded.toString("base64") !== value) {
    return null;
  }
  return decoded;
}

function boundedString(value: unknown, max = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;
}

function utcTimestampMs(value: unknown): number | null {
  if (typeof value !== "string" || value.length < 20 || value.length > 64) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function exactObject(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key));
}

function isValidCommercialPayload(value: unknown): value is CommercialLeasePayload {
  if (!exactObject(value, PAYLOAD_FIELDS)) return false;
  if (
    !boundedString(value.license_id, 128) ||
    !boundedString(value.lease_id, 128) ||
    !Number.isSafeInteger(value.generation) ||
    (value.generation as number) < 1 ||
    !Number.isSafeInteger(value.server_revision) ||
    (value.server_revision as number) < 1 ||
    !boundedString(value.product_id, 128) ||
    !boundedString(value.installation_id, 256) ||
    !boundedString(value.device_id, 256) ||
    !boundedString(value.version, 64) ||
    !SEMVER_PATTERN.test(value.version) ||
    !boundedString(value.issuer, 256) ||
    !boundedString(value.key_id, 128) ||
    !KEY_ID_PATTERN.test(value.key_id) ||
    value.algorithm !== "Ed25519" ||
    typeof value.revoked !== "boolean" ||
    (value.superseded_by !== null && !boundedString(value.superseded_by, 128))
  ) {
    return false;
  }
  const issuedMs = utcTimestampMs(value.issued_at);
  const notBeforeMs = utcTimestampMs(value.not_before);
  const expiresMs = utcTimestampMs(value.expires_at);
  if (issuedMs === null || notBeforeMs === null || expiresMs === null) return false;
  return issuedMs <= expiresMs && notBeforeMs < expiresMs;
}

export function verifyCommercialLeaseEnvelope(
  lease: CommercialLeaseEnvelope,
  publicKey: string,
): boolean {
  if (!lease || typeof lease !== "object") return false;
  if (
    lease.algorithm !== "Ed25519" ||
    typeof lease.payload !== "string" ||
    lease.payload.length === 0 ||
    lease.payload.length > 16384 ||
    typeof lease.key_id !== "string" ||
    !KEY_ID_PATTERN.test(lease.key_id)
  ) {
    return false;
  }
  const signature = decodeCanonicalBase64(lease.signature, 64);
  if (!signature) return false;
  try {
    const key = createPublicKey(keyMaterial(publicKey));
    if (key.asymmetricKeyType !== "ed25519") return false;
    return verify(null, Buffer.from(lease.payload, "utf8"), key, signature);
  } catch {
    return false;
  }
}

export function verifyCommercialLease(
  envelope: CommercialLeaseEnvelope,
  trustedKeys: ReadonlyMap<string, CommercialLeaseTrustedKey>,
  expected: CommercialLeaseVerificationContext,
): CommercialLeaseVerificationResult {
  const fail = (reason: CommercialLeaseVerificationFailureReason): CommercialLeaseVerificationResult =>
    ({ ok: false, reason });

  if (
    !envelope ||
    typeof envelope !== "object" ||
    Array.isArray(envelope) ||
    envelope.algorithm !== "Ed25519" ||
    typeof envelope.payload !== "string" ||
    envelope.payload.length === 0 ||
    envelope.payload.length > 16384 ||
    typeof envelope.key_id !== "string" ||
    !KEY_ID_PATTERN.test(envelope.key_id)
  ) {
    return fail("MALFORMED_ENVELOPE");
  }
  const signature = decodeCanonicalBase64(envelope.signature, 64);
  if (!signature) return fail("MALFORMED_ENVELOPE");

  const trusted = trustedKeys.get(envelope.key_id);
  if (
    !trusted ||
    trusted.status === "REVOKED" ||
    (trusted.status !== "ACTIVE" &&
      trusted.status !== "VERIFY_ONLY" &&
      trusted.status !== "RETIRED")
  ) {
    return fail("UNTRUSTED_KEY_ID");
  }
  if (
    (expected.disallowPublicTestKeys || process.env.DEPLOYMENT_ENV === "production") &&
    isPublicTestFixtureKey(trusted.publicKey, envelope.key_id)
  ) {
    return fail("UNTRUSTED_KEY_ID");
  }

  let verified = false;
  try {
    const publicKey = createPublicKey(keyMaterial(trusted.publicKey));
    if (publicKey.asymmetricKeyType === "ed25519") {
      verified = verify(null, Buffer.from(envelope.payload, "utf8"), publicKey, signature);
    }
  } catch {
    return fail("INVALID_SIGNATURE");
  }
  if (!verified) return fail("INVALID_SIGNATURE");

  let parsed: unknown;
  try {
    parsed = parseUnambiguousJson(Buffer.from(envelope.payload, "utf8"));
  } catch {
    return fail("INVALID_PAYLOAD");
  }
  if (!isValidCommercialPayload(parsed) || parsed.key_id !== envelope.key_id) {
    return fail("INVALID_PAYLOAD");
  }
  if (parsed.revoked) return fail("LEASE_REVOKED");
  if (parsed.superseded_by !== null) return fail("LEASE_SUPERSEDED");

  if (
    parsed.issuer !== expected.issuer ||
    parsed.product_id !== expected.productId ||
    parsed.installation_id !== expected.installationId ||
    parsed.device_id !== expected.deviceId ||
    parsed.version !== expected.version
  ) {
    return fail("SCOPE_MISMATCH");
  }

  const nowMs = expected.now.getTime();
  const futureSkew = expected.allowedFutureSkewMs ?? 300_000;
  if (!Number.isFinite(nowMs) || !Number.isFinite(futureSkew) || futureSkew < 0 || futureSkew > 300_000) {
    return fail("INVALID_PAYLOAD");
  }
  const issuedMs = Date.parse(parsed.issued_at);
  const notBeforeMs = Date.parse(parsed.not_before);
  const expiresMs = Date.parse(parsed.expires_at);
  if (issuedMs > nowMs + futureSkew) return fail("FUTURE_ISSUED_AT");
  if (nowMs + futureSkew < notBeforeMs) return fail("NOT_YET_VALID");
  if (nowMs >= expiresMs) return fail("EXPIRED");

  return { ok: true, payload: parsed, keyId: envelope.key_id };
}

export function createEd25519CommercialLeaseSigner(
  resolver: CommercialPrivateKeyResolver,
  options: Readonly<{ disallowPublicTestKeys?: boolean }> = {},
): CommercialLeaseSigner {
  return Object.freeze({
    async issue(
      payload: CommercialLeasePayload,
      key: CommercialSigningKeyRecord,
    ): Promise<CommercialLeaseEnvelope> {
      if (key.status !== "ACTIVE") throw new Error("COMMERCIAL_SIGNING_KEY_NOT_ACTIVE");
      if (key.algorithm !== "Ed25519") throw new Error("COMMERCIAL_SIGNING_KEY_UNSUPPORTED");
      if (payload.key_id !== key.keyId || payload.algorithm !== "Ed25519") {
        throw new Error("COMMERCIAL_SIGNING_KEY_MISMATCH");
      }

      const rawPrivateKey = await resolver.resolve(key.privateKeyReference);
      const privateKey = createPrivateKey(keyMaterial(rawPrivateKey));
      if (privateKey.asymmetricKeyType !== "ed25519") {
        throw new Error("COMMERCIAL_SIGNING_KEY_INVALID");
      }
      if (
        (options.disallowPublicTestKeys || process.env.DEPLOYMENT_ENV === "production") &&
        isPublicTestFixtureKey(rawPrivateKey, key.keyId)
      ) {
        throw new Error("COMMERCIAL_SIGNING_KEY_INVALID");
      }

      const derivedPublicKey = createPublicKey(privateKey);
      const declaredPublicKey = createPublicKey(keyMaterial(key.publicKey));
      if (declaredPublicKey.asymmetricKeyType !== "ed25519") {
        throw new Error("COMMERCIAL_SIGNING_KEY_MISMATCH");
      }
      const derivedSpki = derivedPublicKey.export({ type: "spki", format: "der" });
      const declaredSpki = declaredPublicKey.export({ type: "spki", format: "der" });
      if (derivedSpki.length !== declaredSpki.length || !timingSafeEqual(derivedSpki, declaredSpki)) {
        throw new Error("COMMERCIAL_SIGNING_KEY_MISMATCH");
      }

      const serialized = canonicalPayload(payload).toString("utf8");
      const signature = sign(null, Buffer.from(serialized, "utf8"), privateKey).toString("base64");
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
