# Accounts extraction boundary

## Objective

The certified Accounts capability set is a staging source for the standalone `@bke/accounts` library. Extraction must move domain ownership without changing business semantics.

## Package-owned source set

Move to `@bke/accounts`:

- `contracts/`
- `logic/`
- `providers/`
- `prisma/schema.prisma`
- `prisma/repositories/`
- package-owned tests from `test/`
- `module.manifest.ts`
- `prisma.config.ts`
- `docs/`

The current staging baseline at `prisma/migrations/0001_accounts_baseline/migration.sql` is package-owned migration content. During physical extraction it maps to `@bke/accounts/migrations/0001_accounts_baseline/migration.sql`, matching the established BKE library layout. The extracted migration must be byte-identical to the certified staging baseline before Digital Solutions staging persistence is retired.

## Host-owned source set

Do not move as Accounts business implementation:

- `module.ts` — Digital Solutions composition adapter
- `test/module-composition.test.ts` — Digital Solutions host composition proof
- HTTP / Next.js routes
- same-origin, rate-limit, cookie/session, email, and audit transport
- sibling-domain enrichment/orchestration

After consumer adoption, the host adapter must import package contracts, logic, providers, repositories, and manifest from `@bke/accounts` rather than retaining duplicate implementation.

## External dependency boundary

Package-owned Accounts TypeScript may use:

- Node.js built-ins
- `pg` for PostgreSQL repositories/certification
- `prisma/config` for package migration configuration
- `vitest` in package tests

It must not import Digital Solutions aliases, Next.js/server-only runtime boundaries, sibling V2 modules, or another `@bke/*` package. Cross-domain principals remain opaque IDs at Accounts contracts.

## Persistence ownership

Accounts owns exactly:

- `CustomerAccount`
- `OrganizationProfile`
- `Membership`
- `Invitation`

Accounts also owns its four Prisma enums. It must not model or query Identity `User`, Commerce tables, Licensing tables, Legal tables, or any other domain persistence.

The application migration ledger `_bke_module_migrations` is composition infrastructure and is not Accounts business persistence.

## Extraction gate

Before physical extraction:

1. package-owned source must pass `test/extraction.certify.ts`;
2. a disposable PostgreSQL baseline must pass `test/persistence-isolation.certify.ts`;
3. all Accounts capability tests and PostgreSQL certifications must remain GREEN;
4. Digital Solutions Composition must remain GREEN on the same candidate head.

Physical extraction then proves the standalone package independently before Digital Solutions consumer adoption. Staging deletion happens only after package certification and consumer composition are GREEN.
