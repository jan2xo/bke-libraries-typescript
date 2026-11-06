# FORGE dependency intent — first-party PayMongo Payment Intents in @bke/payments

**Delegation date:** 2026-11-06, Asia/Manila  
**Source repository:** `jan2xo/bke-libraries-typescript`  
**Base main at delegation:** `a8590377f913a5ce8802fca5cdaf562ad8d4ff7e`  
**Package at baseline:** `@bke/payments@0.9.0`  
**Blocked consumer:** `jan2xo/bke-digital-solutions#275`, unchanged source `cbaf185fe12262367f423fd06666303c06ba300e`.  
**Executor:** FORGE only *after* #275 is parked and its active assignment explicitly released. One worker -> one active PR.  
**Status:** delegated task, **NOT** implemented/certified/released.

## Outcome

Extend the reusable **Payments-owned** capability, durable provider facts, and concrete PayMongo adapter to support the **Payment Intent workflow** required for a **BKE DIGITAL SOLUTIONS–branded, first-party checkout**.

This PR is the shared **library** intent, **not** the BKE website checkout implementation. The website UI, authorized checkout route, hosted-to-intents migration, account role/legal flow, existing Commerce/Entitlements/Licensing composition, and full PayMongo sandbox application receiving proof remain in Digital Solutions PR #275 after the approved immutable package is published. Keep those responsibilities outside this branch.

The owner explicitly rejects PayMongo's generic Checkout Session website as the BKE purchase interface. Use `POST /v1/payment_intents` and applicable Payment Method/client-key interaction, never silently pass a `pi_...` into a hosted `externalCheckoutId` column or call the old `createCheckout()` contract with a fake checkout URL. BKE's QR page will render the provider-generated QR. Required external issuer/bank/3DS/wallet authorization stays genuine and cannot be obscured.

The intended checkout branding is **BKE DIGITAL SOLUTIONS**. The library must not dictate a different storefront identity; retain required truthful legal and processor identity disclosures wherever mandatory. Provider-controlled external UI and statement descriptors are merchant/provider gates, not something this library may falsify.

## Current verified library ownership

Existing source at baseline:
- `@bke/payments/providers/paymongo/paymongo-adapter.ts`: `createCheckout()` issues `/v1/checkout_sessions` and returns `externalCheckoutId + checkoutUrl`.
- `@bke/payments/logic/checkout-attempt-provider.ts` and `contracts/checkout-attempt.contract.ts`: Checkout Session-only result and durable attempt contract.
- `contracts/provider-event-ingestion.contract.ts`: normalized events support Checkout Session/payment/refund identity but not explicit Payment Intent identity.
- `contracts/settlement-fact.contract.ts`: required `externalCheckoutId`; no Payment Intent settlement ID.
- `logic/checkout-attempt*.ts`, `logic/provider-event-*.ts`, `logic/settlement-fact*.ts`, `logic/reconciliation*.ts`, `logic/refund-*.ts`, their PostgreSQL repositories, and package Prisma/migrations: durable claims, signed event ingestion, settlement/reconciliation/refund ownership.
- Existing CI: `.github/workflows/payments.yml` and `.github/workflows/payments-package.yml`. Current `@bke/payments` package version is `0.9.0`.

Payments owns only its own provider-facing lifecycle, attempts, provider events, facts and repositories. It **must not** mutate Commerce Orders/Invoices, BKE account/authorization state, Entitlements, Licensing, or Legal acceptance. Reuse these library boundaries; no new payment engine.

## Contract/API requirements

1. **Explicit Payment Intent capability / provider ports.** Define a clean, versioned additive contract for server-created intents and authorized first-party continuation. Input includes opaque attempt/source references, immutable authoritative amount/currency, mode and provider-scoped idempotency key, without upstream business logic. Result expresses `paymentIntentId` and scoped client key plus current provider lifecycle, **not** an invented hosted checkout URL. Keep client key scoped and documented as sensitive, avoid logging/URLs/analytics. Browser-side Payment Method creation/attachment must be supported by the contract and real provider behavior without raw PAN/CVV reaching BKE backend.
2. **Durable request/attempt correlation.** Persist provider-specific intent identity explicitly, with idempotent source+fingerprint claims, safe retries and exact amount/currency/mode correlation. Preserve/create a recoverable operation identity before making a non-atomic provider request. On timeout/unknown response do not blindly create another payable intent; reconcile with provider and stable idempotency reference, including the provider key window expiration. Ensure independent cancel/disable of *new creation* does not disable inbound settlement of already-created intents.
3. **Actual PayMongo adapter.** Issue documented Payment Intent creation requests; parse and validate provider result/status/identity. Keep Checkout Session compatibility if existing library consumers need it; prevent cross-flow ID aliasing. Implement provider retrieval/reconciliation needed for pending, ambiguous, expired, failed, retried and settled states. Test the exact provider request/response structures with controlled fixtures. Method availability is merchant-and-mode capability-gated; do not hardcode unsupported card/wallet access.
4. **Signed webhook normalizer.** Preserve raw-body HMAC signature verification, timestamp/replay bounds, expected livemode, idempotent event claims and conflict detection. Parse the actual `payment.paid`, `payment.failed`, `payment_intent.succeeded`, QR expiry and refund events as applicable, with explicit `paymentIntentId` correlation. Event types and resource shapes must be verified against current PayMongo docs and real fixtures; do not assume all events carry a Checkout Session. Never treat a browser return or unattested event as payment proof.
5. **Settlement facts / repository / matching.** Extend durable Payments settlement facts to explicitly identify the **correct** Payment Intent and underlying payment and attempt. Strictly match merchant mode, provider, amount, currency, immutable commercial/source reference and event payment identifiers. Reject conflicting, cross-mode, cross-attempt, duplicate and reordered events; preserve exactly-once settlement facts for downstream Commerce/Entitlements/Licensing. No duplicate commercial right. Maintain refund, reversal and existing reconciliation compatibility.
6. **Append-only migration + versioning.** No destructive rewrite of published migrations/schema; add only the smallest justified Payment-owned PostgreSQL schema change, with replay/idempotence and existing source-byte migration checks preserved. Prefer backward-compatible additive contracts where possible. Bump library version according to actual compatibility/semver impact and publish only an immutable, independently certified artifact after owner-authorized merge/release. Do not overwrite `0.9.0` or point consumers to a mutable branch.
7. **Provider SDK/runtime compatibility.** Maintain Node and Workers-compatible provider boundaries for current Digital Solutions deployments. Any Web Crypto / `node:crypto` changes must be evidence-driven; no weakening webhook authentication to satisfy Workers. No separate service/database/queue, credential store or ad hoc business-policy orchestration.

## Required behaviors and adversarial evidence

- Payment Intent created with server-authoritative amount/currency and correct test/live key mode; invalid, mismatched and unsupported requests fail closed.
- QR Ph creation and attach contract produces genuine `next_action.code.image_url`, accurate status/expiry data suitable for BKE rendering. Library does not generate synthetic QR or host UI.
- PayMongo **test-mode QR may encode an actual payment**: automated/human tests must use documented `test_url` simulation, not scan with a real banking app.
- Duplicate click, repeated attempt, concurrent callers, timeout after provider create, lost response, retries beyond provider idempotency lifetime, provider conflict/404 and stale key are safe: no parallel payable attempts or blind charges.
- Payment Method failure can return an intent to `awaiting_payment_method`; distinguish it from a globally terminal failure. Handle `processing`, `awaiting_next_action`, `succeeded`, expiry and cancellation appropriately.
- Invalid/raw-body-mutated/stale/replayed webhook signatures fail closed; provider resource vs event mismatch, amount/currency/reference/mode mismatch, duplicate/out-of-order/conflicting provider events never mint or duplicate settlement facts.
- A real signed/verified settlement fact is required before downstream application may issue a commercial license. Refund/cancellation/reconciliation and hosted-session consumers must not regress.
- Secret key, webhook secret, client key, raw PAN/CVV and sensitive provider payloads are excluded from logs, errors, workflow artifacts and persisted unprotected fields.
- Tests distinguish controlled provider fixtures from real PayMongo sandbox interactions; do not claim actual test account capabilities or approved card/wallet modes without authorized credentials and provider evidence.

## Minimum complete certification plan

FORGE must inspect actual changed modules and repository workflow graph, then declare and execute the minimum **complete** set at exact head:
- `@bke/payments` TypeScript build/typecheck and current Vitest provider/logic tests;
- new genuine Payment Intents protocol, webhook, retry/recovery and adversarial tests;
- disposable PostgreSQL schema validation, forward migration replay and idempotence, concurrent checkout claims, provider-event/settlement/reconciliation/refund certification;
- Payments package boundary / packed tarball contents / clean consumer import smoke;
- CI source/provenance, non-regression of old Checkout Session API where supported, and production dependency audit where required;
- separate provider sandbox proof **only** through approved test credentials; distinguish this from mocked source certification;
- immutable versioned release artifact, SHA-256 and consumer fetch verification after independent review and explicit release authorization.

Existing `.github/workflows/payments.yml` and `.github/workflows/payments-package.yml` are the initial known workflows. Verify their actual current content and whether any explicit certification plan supersedes them. No unneeded CI graph. Every CI failure comment: 1–2 line causal summary + exact head/run/link.

## Delivery and handback to #275

Before implementation, post `BKE EXECUTION CHECKPOINT — DISCOVERY` with actual head, existing API and repo migrations, versioning design, exact CI graph, provider restrictions and any outside-PR needs. Implement in **this shared-library PR only**. When source is certified and reviewed, request appropriate owner decision for release/merge; do not self-authorize.

After legitimate immutable release, post `BKE EXECUTION CHECKPOINT — RELEASE HANDOFF` containing exact source SHA, release/tag, immutable tarball URL/identity, SHA-256, contract version, required migration order, retained compatibility, source/fixture/sandbox evidence and known unsatisfied test-mode capabilities. Only then resume PR #275 by consuming and SHA-verifying the artifact and implementing the BKE UI and host integration.

**Strict locks:** production and real charges/refunds OFF; no PayMongo merchant activation, live credentials, DNS, new paid resource, live test QR scanning, unauthorized merge/deploy, rewrite of published package `0.9.0`, V1 customer import, BKE Customer/Google/MFA application changes, unrelated Supply Chain cleanup or writes to SOL's PRs. Keep #275 parked while FORGE owns this library PR.

## Reference

Blocked consumer implementation ledger: https://github.com/jan2xo/bke-digital-solutions/pull/275

Provider documentation (verify specific semantics rather than guessing):
- https://docs.paymongo.com/docs/payment-acceptance-key-concepts
- https://docs.paymongo.com/docs/payment-acceptance-qr-ph-api
- https://docs.paymongo.com/docs/payment-acceptance-quick-start
- https://docs.paymongo.com/docs/developer-tools-webhooks-events
- https://docs.paymongo.com/docs/payment-acceptance-testing
