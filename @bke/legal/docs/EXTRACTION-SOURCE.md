# Legal extraction boundary

## Objective

The certified Legal capability set is a staging source for the standalone `@bke/legal` library. Extraction moves domain ownership without changing acceptance semantics.

## WHAT I NEED

Legal accepts opaque principal/account identifiers plus an exact legal document/version/rendered-content identity. It does not own Accounts, Identity, Commerce, Payments, Entitlements, or Licensing persistence.

## WHAT I DO / WHAT I OWN

Legal owns exactly:

- `LegalDocumentVersion`
- `LegalAcceptance`
- the `bke.legal.acceptance.v1` capability
- legal acceptance validation, recording, and lookup

The staging migration `prisma/migrations/0001_legal_acceptance_baseline/migration.sql` is package-owned migration content. Physical extraction maps it to `@bke/legal/migrations/0001_legal_acceptance_baseline/migration.sql` and must preserve it byte-for-byte.

## WHAT I GIVE

Legal gives a transport-neutral acceptance capability that records and checks acceptance snapshots without requiring host UI, HTTP, sessions, or sibling-domain database access.

## Package-owned source set

Move to `@bke/legal`:

- `contracts/`
- `logic/`
- `prisma/schema.prisma`
- `prisma/repositories/`
- package-owned tests from `test/`
- `module.manifest.ts`
- `prisma.config.ts`
- `docs/`
- the Legal baseline migration

## Host-owned source set

Do not move as Legal business implementation:

- `module.ts` — Digital Solutions composition adapter
- `test/module-composition.test.ts` — host composition proof
- HTTP / Next.js routes
- authentication/session transport
- checkout policy deciding whether Legal is required
- sibling-domain orchestration

A host may explicitly choose a `NOT_REQUIRED` legal path for a workflow whose policy does not require acceptance. That policy decision is outside the Legal package; Legal never fabricates acceptance.

## Extraction gate

Before physical extraction:

1. package-owned source passes `test/extraction.certify.ts`;
2. disposable PostgreSQL persistence passes `test/persistence-isolation.certify.ts`;
3. Legal acceptance behavior remains GREEN;
4. Digital Solutions Composition remains GREEN on the same candidate head.

Physical extraction then proves the standalone package independently before Digital Solutions consumer adoption. Staging deletion happens only after package certification and consumer composition are GREEN.
