import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { TextDecoder } from "node:util";
import {
  ACCOUNT_PRODUCT_LEASE_ACTIONS,
  ACCOUNT_PRODUCT_LEASE_JWS_TYP,
  ACCOUNT_PRODUCT_LEASE_SCHEMA,
  type AccountProductLeaseClaims,
  type AccountProductLeaseTrustedKey,
  type AccountProductLeaseVerificationContext,
  type AccountProductLeaseVerificationResult,
} from "../contracts/account-product-lease.contract";

const KID = /^[A-Za-z0-9._-]{1,128}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const THUMBPRINT = /^[A-Za-z0-9_-]{43}$/;
const HEADER_KEYS = ["alg", "kid", "typ"] as const;
const CLAIM_KEYS = [
  "schema", "issuer", "audience", "leaseId", "accountId", "userId",
  "productId", "agentSessionId", "agentKeyThumbprint", "keyProtection",
  "plan", "allowedActions", "issuedAt", "refreshAfter", "expiresAt",
] as const;

function exactObject(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    Object.keys(value).every((key) => fields.includes(key));
}
function text(value: unknown, max = 128): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max &&
    value.trim() === value;
}
function utcTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const n = Date.parse(value);
  return Number.isFinite(n) && new Date(n).toISOString() === value ? n : null;
}
function claimsValid(value: unknown): value is AccountProductLeaseClaims {
  if (!exactObject(value, CLAIM_KEYS)) return false;
  if (value.schema !== ACCOUNT_PRODUCT_LEASE_SCHEMA ||
    !text(value.issuer, 256) || !text(value.audience, 256) ||
    !text(value.leaseId) || !text(value.accountId) || !text(value.userId) ||
    !text(value.productId) || !text(value.agentSessionId) ||
    !text(value.plan) ||
    typeof value.agentKeyThumbprint !== "string" ||
    !THUMBPRINT.test(value.agentKeyThumbprint) ||
    (value.keyProtection !== "tpm" && value.keyProtection !== "software") ||
    !Array.isArray(value.allowedActions) || value.allowedActions.length === 0 ||
    value.allowedActions.length > ACCOUNT_PRODUCT_LEASE_ACTIONS.length)
    return false;
  const actions = value.allowedActions;
  if (!actions.every((action: unknown) => ACCOUNT_PRODUCT_LEASE_ACTIONS.some(v => v === action)) ||
    new Set(actions).size !== actions.length) return false;
  const issued = utcTime(value.issuedAt);
  const refresh = utcTime(value.refreshAfter);
  const expires = utcTime(value.expiresAt);
  return issued !== null && refresh !== null && expires !== null &&
    issued <= refresh && refresh < expires;
}
function b64url(input: Buffer): string {
  return input.toString("base64url");
}
function decode(part: string): Buffer | null {
  if (!BASE64URL.test(part) || part.length > 16384) return null;
  const bytes = Buffer.from(part, "base64url");
  return b64url(bytes) === part ? bytes : null;
}

/**
 * Parse signed JSON without ambiguous duplicate object members or lossy UTF-8.
 * JSON.parse first enforces the complete JSON grammar; this bounded structural
 * walk additionally rejects duplicate decoded property names at any depth.
 * Escaped spellings of a key (e.g. "product\u0049d") count as the same key.
 * The actual JWS signature is always checked over the original encoded bytes.
 */
function parseUnambiguousJson(bytes: Buffer): unknown {
  const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const parsed: unknown = JSON.parse(source);
  let cursor = 0;
  const whitespace = () => {
    while (cursor < source.length && " \t\r\n".includes(source[cursor])) cursor++;
  };
  const readString = (): string => {
    const start = cursor++;
    while (cursor < source.length) {
      const character = source[cursor++];
      if (character === "\\") { cursor++; continue; }
      if (character === '"') break;
    }
    return JSON.parse(source.slice(start, cursor)) as string;
  };
  const walk = (depth: number): void => {
    if (depth > 32) throw new Error("JSON_NESTING_TOO_DEEP");
    whitespace();
    if (source[cursor] === "{") {
      cursor++;
      whitespace();
      const seen = new Set<string>();
      if (source[cursor] === "}") { cursor++; return; }
      while (cursor < source.length) {
        whitespace();
        const key = readString();
        if (seen.has(key)) throw new Error("DUPLICATE_JSON_MEMBER");
        seen.add(key);
        whitespace();
        cursor++; // Colon: syntax has already been validated by JSON.parse.
        walk(depth + 1);
        whitespace();
        if (source[cursor++] === "}") return;
      }
    } else if (source[cursor] === "[") {
      cursor++;
      whitespace();
      if (source[cursor] === "]") { cursor++; return; }
      while (cursor < source.length) {
        walk(depth + 1);
        whitespace();
        if (source[cursor++] === "]") return;
      }
    } else if (source[cursor] === '"') {
      readString();
    } else {
      while (cursor < source.length && !",]} \t\r\n".includes(source[cursor])) cursor++;
    }
  };
  walk(0);
  return parsed;
}

/** Sign exact JWS Compact bytes, not re-serialized JSON. Host supplies the key. */
export function issueAccountProductLeaseJws(
  claims: AccountProductLeaseClaims,
  signer: Readonly<{ kid: string; privateKeyPem: string }>,
): string {
  if (!claimsValid(claims)) throw new Error("ACCOUNT_PRODUCT_LEASE_CLAIMS_INVALID");
  if (!KID.test(signer.kid)) throw new Error("ACCOUNT_PRODUCT_LEASE_KID_INVALID");
  const privateKey = createPrivateKey(signer.privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519")
    throw new Error("ACCOUNT_PRODUCT_LEASE_SIGNING_KEY_INVALID");

  const header = { alg: "EdDSA", kid: signer.kid, typ: ACCOUNT_PRODUCT_LEASE_JWS_TYP };
  const input = [
    b64url(Buffer.from(JSON.stringify(header), "utf8")),
    b64url(Buffer.from(JSON.stringify(claims), "utf8")),
  ].join(".");
  return input + "." + b64url(sign(null, Buffer.from(input, "ascii"), privateKey));
}

/**
 * Verify the signature over original compact bytes before parsing claims.
 * Only keys supplied by a pinned, trusted host keyring are eligible; an
 * untrusted JWS header can SELECT a kid, never introduce key material.
 */
export function verifyAccountProductLeaseJws(
  jws: string,
  keys: ReadonlyMap<string, AccountProductLeaseTrustedKey>,
  expected: AccountProductLeaseVerificationContext,
): AccountProductLeaseVerificationResult {
  const bad = (reason: Exclude<AccountProductLeaseVerificationResult, {ok: true}>["reason"]) =>
    ({ ok: false as const, reason });

  if (typeof jws !== "string" || jws.length > 16384)
    return bad("MALFORMED_JWS");
  const pieces = jws.split(".");
  if (pieces.length !== 3 || pieces.some(p => p.length === 0))
    return bad("MALFORMED_JWS");
  const [protected64, payload64, sig64] = pieces;
  const protectedBytes = decode(protected64);
  const payloadBytes = decode(payload64);
  const signature = decode(sig64);
  if (!protectedBytes || !payloadBytes || !signature || signature.length !== 64)
    return bad("MALFORMED_JWS");

  let header: unknown;
  try { header = parseUnambiguousJson(protectedBytes); }
  catch { return bad("MALFORMED_JWS"); }
  if (!exactObject(header, HEADER_KEYS) || header.alg !== "EdDSA" ||
    header.typ !== ACCOUNT_PRODUCT_LEASE_JWS_TYP ||
    typeof header.kid !== "string" || !KID.test(header.kid))
    return bad("MALFORMED_JWS");

  const kid = header.kid;
  const key = keys.get(kid);
  if (!key || key.state === "REVOKED" ||
    (key.state !== "ACTIVE" && key.state !== "VERIFY_ONLY"))
    return bad("UNTRUSTED_KID");

  try {
    const publicKey = createPublicKey(key.publicKeyPem);
    if (publicKey.asymmetricKeyType !== "ed25519" ||
      !verify(null, Buffer.from(protected64 + "." + payload64, "ascii"), publicKey, signature))
      return bad("INVALID_SIGNATURE");
  } catch { return bad("INVALID_SIGNATURE"); }

  let parsed: unknown;
  try { parsed = parseUnambiguousJson(payloadBytes); }
  catch { return bad("INVALID_CLAIMS"); }
  if (!claimsValid(parsed)) return bad("INVALID_CLAIMS");

  if (parsed.issuer !== expected.issuer ||
    parsed.audience !== expected.audience ||
    parsed.accountId !== expected.accountId ||
    parsed.userId !== expected.userId ||
    parsed.productId !== expected.productId ||
    parsed.agentSessionId !== expected.agentSessionId ||
    parsed.agentKeyThumbprint !== expected.agentKeyThumbprint ||
    !parsed.allowedActions.includes(expected.action))
    return bad("CLAIM_MISMATCH");

  const current = expected.now.getTime();
  if (!Number.isFinite(current)) return bad("INVALID_CLAIMS");
  const futureSkew = expected.allowedFutureSkewMs ?? 300_000;
  if (!Number.isFinite(futureSkew) || futureSkew < 0 || futureSkew > 300_000)
    return bad("INVALID_CLAIMS");
  if (Date.parse(parsed.issuedAt) > current + futureSkew)
    return bad("FUTURE_ISSUED_AT");
  if (current >= Date.parse(parsed.expiresAt))
    return bad("EXPIRED");
  return { ok: true, kid, claims: parsed };
}
