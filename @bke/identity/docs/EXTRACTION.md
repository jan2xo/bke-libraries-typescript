# @bke/identity extraction contract

## Destination

The owner-planned destination is the future `bke-libraries-typescript` repository as a standalone TypeScript library named `@bke/identity`.

The library target is:

```text
@bke/identity/
├── contracts/
├── logic/
├── providers/
├── prisma/
├── migrations/
├── tests/
├── module.manifest.ts
└── docs/
```

## Ownership

`@bke/identity` owns Identity domain contracts, Identity business/security logic, provider implementations required by Identity, Identity PostgreSQL repositories/schema/migrations, Identity tests/certification, and Identity documentation.

It does not own HTTP routes, Next.js, cookies, request parsing, same-origin enforcement, rate limiting, UI, email transport orchestration, AuditLog/SecurityEvent persistence, CustomerAccount, LegalAcceptance, or sibling-module business logic.

## Digital Solutions staging mapping

The current V2 module is intentionally staged inside Digital Solutions. Extraction is mechanical:

- `contracts/` -> `contracts/`
- `logic/` -> `logic/`
- `logic/providers/` -> `providers/`
- `prisma/schema.prisma` + `prisma/repositories/` -> `prisma/`
- `prisma/migrations/` -> `migrations/`
- `test/` -> `tests/`
- `module.manifest.ts` -> `module.manifest.ts`
- `docs/` -> `docs/`

Those path changes must not require Identity business-logic rewrites.

## Host adapters are not library code

`module.ts` is the Digital Solutions composition adapter. It may depend on the host composition contract and remains with the application when the library is extracted. Consumers are expected to compose the library capabilities they need.

`prisma.config.ts` is current-repository Prisma CLI wiring. The future library repository may provide its own repository-level Prisma CLI configuration without changing Identity schema or migration ownership.

## Certification rule

Library workers prove Identity behavior, persistence invariants, migration behavior, rollback safety, and extraction boundaries. Application workers consume a certified library version and prove only their composition/adapters.

If extracting this module requires rewriting Identity business logic, the extraction gate is RED.
