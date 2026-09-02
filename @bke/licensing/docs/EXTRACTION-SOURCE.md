# Licensing extraction boundary

## Objective

The certified V2 Licensing capability set is a staging source for the standalone `@bke/licensing` library. Extraction preserves licensing semantics and moves reusable ownership without pulling Digital Solutions composition into the package.

## WHAT I NEED

Licensing receives opaque license/account/product/runtime identifiers and encrypted key material through its own contracts and repositories. It does not own Accounts, Identity, Commerce, Legal, Payments, or Entitlements persistence.

## WHAT I DO / WHAT I OWN

Licensing owns its license/runtime persistence, key-reveal policy, decryption seam, clock seam, and `bke.licensing.license-key-reveal.v1` capability.

The staging migration `prisma/migrations/0001_licensing_baseline/migration.sql` is package-owned migration content. Physical extraction maps it to `@bke/licensing/migrations/0001_licensing_baseline/migration.sql` and must preserve it byte-for-byte.

## WHAT I GIVE

Licensing gives transport-neutral licensing capabilities that can be composed by Digital Solutions or another BKE application without importing that application's UI, HTTP, sessions, or sibling-domain database clients.

## Package-owned source set

Move to `@bke/licensing`:

- `contracts/`
- `logic/`
- `providers/`
- `prisma/schema.prisma`
- `prisma/repositories/`
- package-owned tests from `test/`
- `module.manifest.ts`
- `prisma.config.ts`
- `docs/`
- the Licensing baseline migration

## Host-owned source set

Do not move as Licensing business implementation:

- `module.ts` — Digital Solutions composition adapter
- `test/module-composition.test.ts` — host composition proof
- HTTP / Next.js routes
- authentication/session transport
- checkout or entitlement orchestration
- Licensing Agent network transport

## Extraction gate

Before physical extraction:

1. package-owned source passes `test/extraction.certify.ts`;
2. disposable PostgreSQL persistence passes the existing `test/persistence-isolation.certify.ts`;
3. license-key reveal behavior remains GREEN;
4. Digital Solutions Composition remains GREEN on the same candidate head.

Physical extraction then proves the standalone package independently before Digital Solutions consumer adoption. Staging deletion happens only after package certification and consumer composition are GREEN.
