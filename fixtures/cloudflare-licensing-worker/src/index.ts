/**
 * BKE Disposable Cloudflare Worker Fixture Issuer
 *
 * CAUTION / AUDIT NOTICE:
 * This Worker is an ephemeral test fixture intended strictly for local `workerd`
 * runtime compatibility testing, cryptographic round-trips, and CI certification.
 * It is NOT an authorized licensing authority, NOT a commerce backend, and MUST NEVER
 * be deployed to a public Cloudflare environment or used to authorize production workloads.
 * Real licensing authority resides exclusively in BKE Digital Solutions and the genuine
 * installed BKE Licensing Agent.
 */

import { createHmac, generateKeyPairSync, sign, timingSafeEqual } from "node:crypto";
import type {
  AccountProductLeaseClaims,
  AccountProductLeaseTrustedKey,
  AccountProductLeaseVerificationContext,
} from "@bke/licensing/contracts/account-product-lease.contract";
import type {
  CommercialLeaseEnvelope,
  CommercialLeaseTrustedKey,
  CommercialLeaseVerificationContext,
} from "@bke/licensing/contracts/commercial-lease.contract";
import {
  issueAccountProductLeaseJws,
  spkiThumbprint,
  verifyAccountProductLeaseJws,
} from "@bke/licensing/providers/ed25519-account-product-lease";
import {
  createEd25519CommercialLeaseSigner,
  verifyCommercialLease,
} from "@bke/licensing/providers/ed25519-commercial-lease-signer";

export interface Env {
  TEST_ISSUER_KID?: string;
}

const DEFAULT_KID = "disposable-cf-issuer-2026";
const POLICY_PROTOCOL = "bke.installed-startup-issuance.v1";
const POLICY_DOMAIN = "BKE-STANDALONE-STARTUP-POLICY-V1\n";
const MAX_REQUEST_BYTES = 65536;

// Ephemeral test-only Ed25519 key pair held in Worker instance memory.
// Never persistent, never a production key.
const ephemeralKeyPair = generateKeyPairSync("ed25519");
const activePublicKeyPem = ephemeralKeyPair.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const activePrivateKeyPem = ephemeralKeyPair.privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
const activeThumbprint = spkiThumbprint(ephemeralKeyPair.publicKey);

export interface EnrolledFixtureInstallation {
  installationId: string;
  productId: string;
  version: string;
  imagePath: string;
  imageSha256: string;
  allowedUserSid: string;
  activationMode: "ACCOUNT" | "LICENSE_KEY" | "EITHER";
  fixtureAgentSecret: string;
}

export const ENROLLED_TEST_INSTALLATIONS: Record<string, EnrolledFixtureInstallation> = {
  "00000000-0000-0000-0000-000000000123": {
    installationId: "00000000-0000-0000-0000-000000000123",
    productId: "render-dock",
    version: "1.0.3",
    imagePath: "C:\\Program Files\\BKE Digital Solutions\\Render Dock\\RENDER DOCK.exe",
    imageSha256: "a".repeat(64),
    allowedUserSid: "S-1-5-21-111-222-333-1001",
    activationMode: "LICENSE_KEY",
    fixtureAgentSecret: "disposable-fixture-agent-attestation-secret-2026",
  },
};

const seenNonces = new Set<string>();

export function resetFixtureState(): void {
  seenNonces.clear();
}

/**
 * Formats a Date object as a canonical .NET "O" (round-trip) UTC timestamp:
 * yyyy-MM-ddTHH:mm:ss.fffffff+00:00 (7 decimal places and explicit +00:00 offset).
 * Strictly required by BKE Licensing Agent's RequiredTime parser.
 */
export function formatCanonicalDotNetTime(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");
  const ms = date.getUTCMilliseconds().toString().padStart(3, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}0000+00:00`;
}

export function createTestInstallAttestation(options: {
  installationId?: string;
  productId?: string;
  nonce?: string;
  timestamp?: string;
  secret?: string;
} = {}): string {
  const installationId = options.installationId ?? "00000000-0000-0000-0000-000000000123";
  const productId = options.productId ?? "render-dock";
  const nonce = options.nonce ?? crypto.randomUUID();
  const timestamp = options.timestamp ?? new Date().toISOString();
  const secret = options.secret ?? "disposable-fixture-agent-attestation-secret-2026";
  const schema = "bke.agent-install-attestation.v1";

  const message = `${schema}:${installationId}:${productId}:${nonce}:${timestamp}`;
  const hmac = createHmac("sha256", secret).update(message).digest("hex");

  return JSON.stringify({
    schema,
    installation_id: installationId,
    product_id: productId,
    nonce,
    timestamp,
    signature: hmac,
  });
}

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function errorResponse(status: number, error: string, reason?: string): Response {
  return jsonResponse({ error, reason }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const kid = env.TEST_ISSUER_KID || DEFAULT_KID;

    // Reject unsupported methods early
    if (request.method !== "GET" && request.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED");
    }

    // 1. Health check
    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse({
        status: "ok",
        role: "disposable-licensing-fixture-issuer",
        runtime: "cloudflare-worker-workerd",
        kid,
        thumbprint: activeThumbprint,
      });
    }

    // 2. Public keys endpoint
    if (url.pathname === "/api/test/public-keys" && request.method === "GET") {
      return jsonResponse({
        keys: [
          {
            kid,
            publicKeyPem: activePublicKeyPem,
            state: "ACTIVE",
            thumbprint: activeThumbprint,
          },
        ],
      });
    }

    // Guard payload size for POST routes
    if (request.method === "POST") {
      const contentLength = request.headers.get("content-length");
      if (contentLength && Number.parseInt(contentLength, 10) > MAX_REQUEST_BYTES) {
        return errorResponse(413, "PAYLOAD_TOO_LARGE");
      }
    }

    // 3. Issue Account-Product Lease JWS
    if (url.pathname === "/api/test/issue-account-lease" && request.method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        const text = await request.text();
        if (text.length > 0) body = JSON.parse(text);
      } catch {
        return errorResponse(400, "INVALID_JSON");
      }

      const now = new Date();
      const ttlMinutes = typeof body.ttlMinutes === "number" ? body.ttlMinutes : 15;
      const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
      const refreshAfter = new Date(now.getTime() + Math.floor(ttlMinutes / 2) * 60 * 1000).toISOString();

      const claims: AccountProductLeaseClaims = {
        schema: "bke.product-lease.v1",
        issuer: typeof body.issuer === "string" ? body.issuer : "https://auth.disposable-cf.example",
        audience: typeof body.audience === "string" ? body.audience : "bke-desktop-native",
        leaseId: typeof body.leaseId === "string" ? body.leaseId : `lease_cf_${Date.now()}`,
        accountId: typeof body.accountId === "string" ? body.accountId : "acct_cf_test_001",
        userId: typeof body.userId === "string" ? body.userId : "usr_cf_test_001",
        productId: typeof body.productId === "string" ? body.productId : "render-dock",
        agentSessionId: typeof body.agentSessionId === "string" ? body.agentSessionId : "sess_cf_001",
        agentKeyThumbprint: typeof body.agentKeyThumbprint === "string" ? body.agentKeyThumbprint : activeThumbprint,
        keyProtection: "tpm",
        plan: "PRO",
        allowedActions: Array.isArray(body.allowedActions) ? (body.allowedActions as ("OPEN" | "USE")[]) : ["OPEN", "USE"],
        issuedAt: now.toISOString(),
        refreshAfter,
        expiresAt,
      };

      try {
        const jws = issueAccountProductLeaseJws(claims, {
          kid,
          privateKeyPem: activePrivateKeyPem,
        });
        return jsonResponse(
          {
            jws,
            kid,
            publicKeyPem: activePublicKeyPem,
            claims,
          },
          201,
        );
      } catch (err) {
        return errorResponse(400, "LEASE_SIGNING_FAILED", err instanceof Error ? err.message : String(err));
      }
    }

    // 4. Issue Commercial Lease Envelope
    if (url.pathname === "/api/test/issue-commercial-lease" && request.method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        const text = await request.text();
        if (text.length > 0) body = JSON.parse(text);
      } catch {
        return errorResponse(400, "INVALID_JSON");
      }

      const now = new Date();
      const ttlMinutes = typeof body.ttlMinutes === "number" ? body.ttlMinutes : 60;
      const notBefore = new Date(now.getTime() - 60 * 1000).toISOString();
      const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();

      const payload = {
        license_id: typeof body.licenseId === "string" ? body.licenseId : `lic_cf_${Date.now()}`,
        lease_id: typeof body.leaseId === "string" ? body.leaseId : `comm_lease_cf_${Date.now()}`,
        generation: 1,
        server_revision: 1,
        product_id: typeof body.productId === "string" ? body.productId : "render-dock",
        installation_id: typeof body.installationId === "string" ? body.installationId : "00000000-0000-0000-0000-000000000123",
        device_id: typeof body.deviceId === "string" ? body.deviceId : "dev_cf_machine_0001",
        version: typeof body.version === "string" ? body.version : "1.0.3",
        issuer: "BKE Digital Solutions",
        issued_at: now.toISOString(),
        not_before: notBefore,
        expires_at: expiresAt,
        key_id: kid,
        algorithm: "Ed25519" as const,
        revoked: body.revoked === true,
        superseded_by: null,
      };

      try {
        const resolver = {
          resolve: () => activePrivateKeyPem,
        };
        const signer = createEd25519CommercialLeaseSigner(resolver);
        const signingKeyRecord = {
          keyId: kid,
          algorithm: "Ed25519" as const,
          status: "ACTIVE" as const,
          privateKeyReference: "active",
          publicKey: activePublicKeyPem,
          version: 1,
          createdAt: now.toISOString(),
          supersededAt: null,
        };
        const envelope = await signer.issue(payload, signingKeyRecord);
        return jsonResponse(
          {
            envelope,
            keyId: kid,
            publicKeyPem: activePublicKeyPem,
            payload,
          },
          201,
        );
      } catch (err) {
        return errorResponse(400, "COMMERCIAL_SIGNING_FAILED", err instanceof Error ? err.message : String(err));
      }
    }

    // 5. Agent Standalone Startup Policy Issuance Handshake (TEST FIXTURE ONLY)
    if (url.pathname === "/api/agent-sessions/startup-policy" && request.method === "POST") {
      const fixtureHeader = request.headers.get("x-bke-test-fixture");
      if (fixtureHeader !== null && fixtureHeader !== "disposable-nonproduction") {
        return errorResponse(400, "INVALID_TEST_FIXTURE_GUARD", "If provided, x-bke-test-fixture must be 'disposable-nonproduction'.");
      }

      const protocolHeader = request.headers.get("x-bke-startup-policy-protocol");
      if (protocolHeader !== POLICY_PROTOCOL) {
        return errorResponse(400, "INVALID_STARTUP_PROTOCOL");
      }

      let body: Record<string, unknown> = {};
      try {
        const text = await request.text();
        if (text.length > 0) body = JSON.parse(text);
      } catch {
        return errorResponse(400, "INVALID_JSON");
      }

      const bodyKeys = Object.keys(body);
      if (bodyKeys.length !== 1 || bodyKeys[0] !== "signed_install_attestation") {
        return errorResponse(400, "UNEXPECTED_BODY_FIELD", "Only signed_install_attestation is accepted. Caller-selected modes and paths are rejected.");
      }

      const rawAttestation = body.signed_install_attestation;
      if (typeof rawAttestation !== "string" || rawAttestation.length < 10) {
        return errorResponse(400, "MISSING_ATTESTATION");
      }

      let attestation: {
        schema?: string;
        installation_id?: string;
        product_id?: string;
        nonce?: string;
        timestamp?: string;
        signature?: string;
      };
      try {
        attestation = JSON.parse(rawAttestation);
      } catch {
        return errorResponse(400, "MALFORMED_ATTESTATION");
      }

      if (
        !attestation ||
        typeof attestation !== "object" ||
        attestation.schema !== "bke.agent-install-attestation.v1" ||
        typeof attestation.installation_id !== "string" ||
        typeof attestation.product_id !== "string" ||
        typeof attestation.nonce !== "string" ||
        typeof attestation.timestamp !== "string" ||
        typeof attestation.signature !== "string"
      ) {
        return errorResponse(400, "MALFORMED_ATTESTATION");
      }

      const ts = Date.parse(attestation.timestamp);
      if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
        return errorResponse(400, "EXPIRED_ATTESTATION_TIMESTAMP");
      }

      if (seenNonces.has(attestation.nonce)) {
        return errorResponse(409, "REPLAY_DENIED");
      }

      const enrolled = ENROLLED_TEST_INSTALLATIONS[attestation.installation_id];
      if (!enrolled) {
        return errorResponse(403, "UNENROLLED_INSTALLATION");
      }

      if (attestation.product_id !== enrolled.productId) {
        return errorResponse(403, "PRODUCT_MISMATCH");
      }

      const message = `${attestation.schema}:${attestation.installation_id}:${attestation.product_id}:${attestation.nonce}:${attestation.timestamp}`;
      const expectedHmac = createHmac("sha256", enrolled.fixtureAgentSecret).update(message).digest("hex");
      try {
        const sigBuf = Buffer.from(attestation.signature, "hex");
        const expBuf = Buffer.from(expectedHmac, "hex");
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          return errorResponse(403, "INVALID_ATTESTATION_SIGNATURE");
        }
      } catch {
        return errorResponse(403, "INVALID_ATTESTATION_SIGNATURE");
      }

      // Mark nonce as consumed
      seenNonces.add(attestation.nonce);
      if (seenNonces.size > 2000) {
        const oldest = seenNonces.values().next().value;
        if (oldest) seenNonces.delete(oldest);
      }

      const now = new Date();
      const notBefore = formatCanonicalDotNetTime(new Date(now.getTime() - 5000));
      const expiresAt = formatCanonicalDotNetTime(new Date(now.getTime() + 25 * 60 * 1000));

      const policyPayload = JSON.stringify({
        schema: "bke.standalone-startup-policy.v1",
        issuer_source_sha: "09c16bc5c7e1d6ab3cb8df0ba569e6da05498f3f",
        product_id: enrolled.productId,
        version: enrolled.version,
        installation_id: enrolled.installationId,
        image_path: enrolled.imagePath,
        image_sha256: enrolled.imageSha256,
        allowed_user_sid: enrolled.allowedUserSid,
        activation_mode: enrolled.activationMode,
        not_before: notBefore,
        expires_at: expiresAt,
      });

      const messageToSign = Buffer.from(POLICY_DOMAIN + policyPayload, "utf8");
      const sig = sign(null, messageToSign, ephemeralKeyPair.privateKey);
      const signatureBase64 = sig.toString("base64");

      const envelopeJson = JSON.stringify({
        schema: "bke.standalone-startup-envelope.v1",
        kid,
        payload: policyPayload,
        signature: signatureBase64,
      });

      return jsonResponse(
        {
          status: "issued",
          signed_policy_envelope: envelopeJson,
          kid,
          activation_mode: enrolled.activationMode,
          expires_at: expiresAt,
        },
        201,
        {
          "x-bke-startup-policy-protocol": POLICY_PROTOCOL,
          "x-bke-test-fixture": "disposable-nonproduction",
        },
      );
    }

    // 6. Verify Account Lease JWS inside Worker
    if (url.pathname === "/api/test/verify-account-lease" && request.method === "POST") {
      let body: { jws?: string; expected?: Partial<AccountProductLeaseVerificationContext> } = {};
      try {
        body = await request.json();
      } catch {
        return errorResponse(400, "INVALID_JSON");
      }

      if (!body.jws || typeof body.jws !== "string") {
        return errorResponse(400, "MISSING_JWS");
      }

      const keys = new Map<string, AccountProductLeaseTrustedKey>([
        [kid, { publicKeyPem: activePublicKeyPem, state: "ACTIVE" }],
      ]);

      const expected: AccountProductLeaseVerificationContext = {
        issuer: body.expected?.issuer ?? "https://auth.disposable-cf.example",
        audience: body.expected?.audience ?? "bke-desktop-native",
        accountId: body.expected?.accountId ?? "acct_cf_test_001",
        userId: body.expected?.userId ?? "usr_cf_test_001",
        productId: body.expected?.productId ?? "render-dock",
        agentSessionId: body.expected?.agentSessionId ?? "sess_cf_001",
        agentKeyThumbprint: body.expected?.agentKeyThumbprint ?? activeThumbprint,
        action: body.expected?.action ?? "OPEN",
        now: body.expected?.now ? new Date(body.expected.now) : new Date(),
      };

      const result = verifyAccountProductLeaseJws(body.jws, keys, expected);
      return jsonResponse(result);
    }

    // 7. Verify Commercial Lease Envelope inside Worker
    if (url.pathname === "/api/test/verify-commercial-lease" && request.method === "POST") {
      let body: { envelope?: CommercialLeaseEnvelope; expected?: Partial<CommercialLeaseVerificationContext> } = {};
      try {
        body = await request.json();
      } catch {
        return errorResponse(400, "INVALID_JSON");
      }

      if (!body.envelope || typeof body.envelope !== "object") {
        return errorResponse(400, "MISSING_ENVELOPE");
      }

      const keys = new Map<string, CommercialLeaseTrustedKey>([
        [kid, { publicKey: activePublicKeyPem, status: "ACTIVE" }],
      ]);

      const expected: CommercialLeaseVerificationContext = {
        issuer: body.expected?.issuer ?? "BKE Digital Solutions",
        productId: body.expected?.productId ?? "render-dock",
        installationId: body.expected?.installationId ?? "00000000-0000-0000-0000-000000000123",
        deviceId: body.expected?.deviceId ?? "dev_cf_machine_0001",
        version: body.expected?.version ?? "1.0.3",
        now: body.expected?.now ? new Date(body.expected.now) : new Date(),
      };

      const result = verifyCommercialLease(body.envelope, keys, expected);
      return jsonResponse(result);
    }

    return errorResponse(404, "NOT_FOUND");
  },
};
