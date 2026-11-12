# BKE account-product lease — reusable library contract (DRAFT)

**Canonical project authority:** [Digital Solutions #340](https://github.com/jan2xo/bke-digital-solutions/issues/340), Wave 1. **Behavioral/library owner:** @bke/licensing in \`bke-libraries-typescript\`. This library does NOT become a second licensing server.

## Exactly one responsibility

Define the portable, versioned JWS Compact (EdDSA/Ed25519) **product execution lease contract** and reference signer/verifier; ship deterministic, public **test-only** golden vectors. Digital Solutions remains the sole trusted issuer of real leases and the sole owner of account/organization/seat/subscription/trial policy, signing-key custody/rotation and lease issuance auditing. Agent may carry/renew leases without custody of DS signing keys, and each authentic product must independently verify signature, policy fields, and possession of the installation-bound Agent key.

*Existing commercial key-based lease v1 and its signing/persistence migrations remain unchanged.* This is a distinct account-session-bound execution lease, **not** a v1 lease schema migration and not a retroactive policy switch.

**Inputs/outputs of this library wave:**
- \`contracts/account-product-lease.contract.ts\`: strict versioned claim/type/serialization contract, \`refreshAfter\` advisory renewal hint, \`expiresAt\` single hard authorization deadline.
- \`providers/ed25519-account-product-lease.ts\`: JWS compact issuer/verifier using node:crypto. EdDSA exact signing input \`base64url(header) + "." + base64url(payload)\`; verify bytes *before* interpreting untrusted claims; strict \`alg\`, \`kid\`, \`typ\`; keys supplied by trusted host mapping, never JWS \`jku\`/inline JWK. NO networking, persistence, Next.js, or database dependency.
- \`tests/\` golden positive/negative vectors for a pinned synthetic public verification key, varied claims, signature tampering, duplicate JSON member names (including escaped names), and invalid UTF-8. Fixtures are **public test keys only**. Deterministic results for future C#, TS and authentic product verifiers.

**Not part of this library wave:** DS route, ownership/query/seat/plan checks, DB schema, real lease issuance, TPM CNG key creation/attestation, Agent private-key proof-of-possession, Launcher UX, installed Render Dock binary, production keys/DNS/DB/release. Later DS implementation must import an **immutable released** @bke/licensing package and certify its own account-session/entitlement/signing behavior. Downstream consumers must pin the exact library/vector SHA or package artifact.

**Interoperability:** Verifiers must reject duplicate JSON member names (after unescaping) and malformed UTF-8 in both JWS protected header and claims. Signed payload bytes remain the verification input; no decode-and-reserialize signature verification. Current test-only vectors: 14 (including forbidden UTF-8 BOM in header/payload); stdout SHA-256 `1e4fefe9df64dd2b0313a7b127c850417659a092647e515411a6595900802d80`.

**Security:** Signature validity alone is not entitlement. The consuming host must supply expected issuer/audience/product/action/session/key thumbprint and current time; the product must additionally require an Agent nonce challenge proof of private-key possession before protected operation. The signed \`keyProtection\` flag is not TPM attestation. Client-side clock rollback mitigation remains a later Agent/product responsibility; the hard \`expiresAt\` remains the stop deadline.

## Certification ownership (source draft, no merge)

* Library licensing logic/typecheck, tests including negative vectors, extraction boundary, package tarball/blank-consumer proof. No live Postgres schema/persistence or production keys touched; existing repo workflows may include shared library checks and should not be mistaken for required production certification.
* No DS, Agent, Launcher or Render Dock CI merely because they later consume this contract; pin exact library SHA for all future consumers.
* PR=ledger, no merge, no immutable package release/publication, no production actions without separate authorization.

**Status:** draft library implementation; exact-head certification must be revalidated after the security-hardening update.
