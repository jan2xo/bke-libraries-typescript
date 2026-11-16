import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestInstallAttestation, resetFixtureState } from "../src/index.js";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const configPath = resolve(__dirname, "../wrangler.jsonc");

describe("BKE Disposable Cloudflare Worker Fixture Issuer", () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeAll(async () => {
    resetFixtureState();
    harness = createTestHarness({
      workers: [{ configPath }],
    });
    await harness.listen();
  });

  afterAll(async () => {
    if (harness) {
      await harness.close();
    }
  });

  // --- Positive Scenarios ---

  it("1. GET /health reports ok status and disposable issuer role", async () => {
    const res = await harness.fetch("http://localhost/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; role: string; runtime: string; kid: string };
    expect(body.status).toBe("ok");
    expect(body.role).toBe("disposable-licensing-fixture-issuer");
    expect(body.runtime).toBe("cloudflare-worker-workerd");
    expect(body.kid).toBe("disposable-cf-issuer-2026");
  });

  it("2. GET /api/test/public-keys returns active Ed25519 public key", async () => {
    const res = await harness.fetch("http://localhost/api/test/public-keys");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<{ kid: string; publicKeyPem: string; state: string }> };
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0].kid).toBe("disposable-cf-issuer-2026");
    expect(body.keys[0].state).toBe("ACTIVE");
    expect(body.keys[0].publicKeyPem).toContain("-----BEGIN PUBLIC KEY-----");
  });

  it("3. POST /api/test/issue-account-lease emits real signed JWS and round-trips through Worker verifier", async () => {
    const issueRes = await harness.fetch("http://localhost/api/test/issue-account-lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: "render-dock",
        accountId: "acct_cf_test_001",
        userId: "usr_cf_test_001",
        allowedActions: ["OPEN", "USE"],
      }),
    });
    expect(issueRes.status).toBe(201);
    const issued = (await issueRes.json()) as { jws: string; kid: string; publicKeyPem: string; claims: any };
    expect(issued.jws).toBeTruthy();
    expect(issued.jws.split(".")).toHaveLength(3);
    expect(issued.claims.productId).toBe("render-dock");

    // Verify inside worker
    const verifyRes = await harness.fetch("http://localhost/api/test/verify-account-lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jws: issued.jws,
        expected: {
          productId: "render-dock",
          accountId: "acct_cf_test_001",
          userId: "usr_cf_test_001",
          action: "OPEN",
        },
      }),
    });
    expect(verifyRes.status).toBe(200);
    const verified = (await verifyRes.json()) as { ok: boolean; reason?: string; claims?: any };
    expect(verified.ok).toBe(true);
    expect(verified.claims?.leaseId).toBe(issued.claims.leaseId);
  });

  it("4. POST /api/test/issue-commercial-lease emits real signed commercial envelope and round-trips", async () => {
    const issueRes = await harness.fetch("http://localhost/api/test/issue-commercial-lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: "render-dock",
        installationId: "00000000-0000-0000-0000-000000000123",
        deviceId: "dev_cf_machine_0001",
        version: "1.0.3",
      }),
    });
    expect(issueRes.status).toBe(201);
    const issued = (await issueRes.json()) as { envelope: any; keyId: string; publicKeyPem: string; payload: any };
    expect(issued.envelope.signature).toBeTruthy();
    expect(issued.envelope.algorithm).toBe("Ed25519");

    // Verify inside worker
    const verifyRes = await harness.fetch("http://localhost/api/test/verify-commercial-lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        envelope: issued.envelope,
        expected: {
          productId: "render-dock",
          installationId: "00000000-0000-0000-0000-000000000123",
          deviceId: "dev_cf_machine_0001",
          version: "1.0.3",
        },
      }),
    });
    expect(verifyRes.status).toBe(200);
    const verified = (await verifyRes.json()) as { ok: boolean; reason?: string };
    expect(verified.ok).toBe(true);
  });

  it("5. POST /api/agent-sessions/startup-policy issues signed policy for enrolled attestation", async () => {
    const validAttestation = createTestInstallAttestation();
    const res = await harness.fetch("http://localhost/api/agent-sessions/startup-policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bke-test-fixture": "disposable-nonproduction",
        "x-bke-startup-policy-protocol": "bke.installed-startup-issuance.v1",
      },
      body: JSON.stringify({
        signed_install_attestation: validAttestation,
      }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("x-bke-startup-policy-protocol")).toBe("bke.installed-startup-issuance.v1");
    expect(res.headers.get("x-bke-test-fixture")).toBe("disposable-nonproduction");
    const body = (await res.json()) as {
      status: string;
      signed_policy_envelope: string;
      kid: string;
      activation_mode: string;
      expires_at: string;
    };
    expect(body.status).toBe("issued");
    expect(body.activation_mode).toBe("LICENSE_KEY");
    expect(body.kid).toBe("disposable-cf-issuer-2026");

    const envelope = JSON.parse(body.signed_policy_envelope);
    expect(envelope.schema).toBe("bke.standalone-startup-envelope.v1");
    expect(envelope.signature).toBeTruthy();
    const payload = JSON.parse(envelope.payload);
    expect(payload.schema).toBe("bke.standalone-startup-policy.v1");
    expect(payload.issuer_source_sha).toBe("09c16bc5c7e1d6ab3cb8df0ba569e6da05498f3f");
    expect(payload.product_id).toBe("render-dock");
    expect(payload.version).toBe("1.0.3");
    expect(payload.installation_id).toBe("00000000-0000-0000-0000-000000000123");
    expect(payload.activation_mode).toBe("LICENSE_KEY");
  });

  // --- Negative / Adversarial Scenarios ---

  it("6. Deny: Unknown path returns 404 NOT_FOUND", async () => {
    const res = await harness.fetch("http://localhost/api/unknown-endpoint");
    expect(res.status).toBe(404);
  });

  it("7. Deny: Unsupported HTTP methods return 405 METHOD_NOT_ALLOWED", async () => {
    const res = await harness.fetch("http://localhost/health", { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  it("8. Deny: Startup policy request without test fixture guard header returns 400", async () => {
    const res = await harness.fetch("http://localhost/api/agent-sessions/startup-policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bke-startup-policy-protocol": "bke.installed-startup-issuance.v1",
      },
      body: JSON.stringify({ signed_install_attestation: createTestInstallAttestation() }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("MISSING_TEST_FIXTURE_GUARD");
  });

  it("9. Deny: Startup policy request without protocol header returns 400", async () => {
    const res = await harness.fetch("http://localhost/api/agent-sessions/startup-policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bke-test-fixture": "disposable-nonproduction",
      },
      body: JSON.stringify({ signed_install_attestation: createTestInstallAttestation() }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_STARTUP_PROTOCOL");
  });

  it("10. Deny: Startup policy request with caller-controlled parameters returns 400 UNEXPECTED_BODY_FIELD", async () => {
    const res = await harness.fetch("http://localhost/api/agent-sessions/startup-policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bke-test-fixture": "disposable-nonproduction",
        "x-bke-startup-policy-protocol": "bke.installed-startup-issuance.v1",
      },
      body: JSON.stringify({
        signed_install_attestation: createTestInstallAttestation(),
        activationMode: "EITHER", // Attacker trying to force arbitrary mode
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("UNEXPECTED_BODY_FIELD");
  });

  it("11. Deny: Startup policy request missing attestation returns 400", async () => {
    const res = await harness.fetch("http://localhost/api/agent-sessions/startup-policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bke-test-fixture": "disposable-nonproduction",
        "x-bke-startup-policy-protocol": "bke.installed-startup-issuance.v1",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("UNEXPECTED_BODY_FIELD");
  });

  it("12. Deny: Malformed attestation JSON returns 400 MALFORMED_ATTESTATION", async () => {
    const res = await harness.fetch("http://localhost/api/agent-sessions/startup-policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bke-test-fixture": "disposable-nonproduction",
        "x-bke-startup-policy-protocol": "bke.installed-startup-issuance.v1",
      },
      body: JSON.stringify({ signed_install_attestation: "not-valid-json-string-123456" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("MALFORMED_ATTESTATION");
  });

  it("13. Deny: Expired attestation timestamp returns 400 EXPIRED_ATTESTATION_TIMESTAMP", async () => {
    const expiredTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const expiredAttestation = createTestInstallAttestation({ timestamp: expiredTimestamp });

    const res = await harness.fetch("http://localhost/api/agent-sessions/startup-policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bke-test-fixture": "disposable-nonproduction",
        "x-bke-startup-policy-protocol": "bke.installed-startup-issuance.v1",
      },
      body: JSON.stringify({ signed_install_attestation: expiredAttestation }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("EXPIRED_ATTESTATION_TIMESTAMP");
  });

  it("14. Deny: Replay of same attestation nonce returns 409 REPLAY_DENIED", async () => {
    const fixedNonce = "replay-nonce-" + crypto.randomUUID();
    const attestation = createTestInstallAttestation({ nonce: fixedNonce });

    // First attempt succeeds
    const res1 = await harness.fetch("http://localhost/api/agent-sessions/startup-policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bke-test-fixture": "disposable-nonproduction",
        "x-bke-startup-policy-protocol": "bke.installed-startup-issuance.v1",
      },
      body: JSON.stringify({ signed_install_attestation: attestation }),
    });
    expect(res1.status).toBe(201);

    // Second attempt with exact same nonce fails closed
    const res2 = await harness.fetch("http://localhost/api/agent-sessions/startup-policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bke-test-fixture": "disposable-nonproduction",
        "x-bke-startup-policy-protocol": "bke.installed-startup-issuance.v1",
      },
      body: JSON.stringify({ signed_install_attestation: attestation }),
    });
    expect(res2.status).toBe(409);
    const body = (await res2.json()) as { error: string };
    expect(body.error).toBe("REPLAY_DENIED");
  });

  it("15. Deny: Unenrolled installation ID returns 403 UNENROLLED_INSTALLATION", async () => {
    const unenrolledAttestation = createTestInstallAttestation({
      installationId: "99999999-9999-9999-9999-999999999999",
    });

    const res = await harness.fetch("http://localhost/api/agent-sessions/startup-policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bke-test-fixture": "disposable-nonproduction",
        "x-bke-startup-policy-protocol": "bke.installed-startup-issuance.v1",
      },
      body: JSON.stringify({ signed_install_attestation: unenrolledAttestation }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("UNENROLLED_INSTALLATION");
  });

  it("16. Deny: Attestation product mismatch returns 403 PRODUCT_MISMATCH", async () => {
    const mismatchAttestation = createTestInstallAttestation({
      productId: "unregistered-app",
    });

    const res = await harness.fetch("http://localhost/api/agent-sessions/startup-policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bke-test-fixture": "disposable-nonproduction",
        "x-bke-startup-policy-protocol": "bke.installed-startup-issuance.v1",
      },
      body: JSON.stringify({ signed_install_attestation: mismatchAttestation }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("PRODUCT_MISMATCH");
  });

  it("17. Deny: Forged attestation signature returns 403 INVALID_ATTESTATION_SIGNATURE", async () => {
    const forgedAttestation = createTestInstallAttestation({
      secret: "wrong-attacker-secret-xyz",
    });

    const res = await harness.fetch("http://localhost/api/agent-sessions/startup-policy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bke-test-fixture": "disposable-nonproduction",
        "x-bke-startup-policy-protocol": "bke.installed-startup-issuance.v1",
      },
      body: JSON.stringify({ signed_install_attestation: forgedAttestation }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_ATTESTATION_SIGNATURE");
  });

  it("18. Deny: Verifying tampered Account JWS payload fails closed with INVALID_SIGNATURE", async () => {
    const issueRes = await harness.fetch("http://localhost/api/test/issue-account-lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "render-dock" }),
    });
    const { jws } = (await issueRes.json()) as { jws: string };
    const parts = jws.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ schema: "bke.product-lease.v1", productId: "tampered" })).toString("base64url");
    const tamperedJws = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const verifyRes = await harness.fetch("http://localhost/api/test/verify-account-lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jws: tamperedJws, expected: { productId: "render-dock" } }),
    });
    const result = (await verifyRes.json()) as { ok: boolean; reason?: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("INVALID_SIGNATURE");
  });

  it("19. Deny: Verifying Account JWS with mismatched action fails closed with CLAIM_MISMATCH", async () => {
    const issueRes = await harness.fetch("http://localhost/api/test/issue-account-lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "render-dock", allowedActions: ["OPEN"] }),
    });
    const { jws } = (await issueRes.json()) as { jws: string };

    const verifyRes = await harness.fetch("http://localhost/api/test/verify-account-lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jws,
        expected: {
          productId: "render-dock",
          action: "USE",
        },
      }),
    });
    const result = (await verifyRes.json()) as { ok: boolean; reason?: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("CLAIM_MISMATCH");
  });

  it("20. Deny: Verifying Commercial Lease with tampered payload fails closed with INVALID_SIGNATURE", async () => {
    const issueRes = await harness.fetch("http://localhost/api/test/issue-commercial-lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "render-dock" }),
    });
    const { envelope } = (await issueRes.json()) as { envelope: any };
    const tamperedEnvelope = {
      ...envelope,
      payload: envelope.payload.replace("render-dock", "tampered-dock"),
    };

    const verifyRes = await harness.fetch("http://localhost/api/test/verify-commercial-lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        envelope: tamperedEnvelope,
        expected: { productId: "render-dock" },
      }),
    });
    const result = (await verifyRes.json()) as { ok: boolean; reason?: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("INVALID_SIGNATURE");
  });
});
