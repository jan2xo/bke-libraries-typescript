# Extraction source

`@bke/entitlements` v0.1.0 is physically extracted from the certified Digital Solutions V2 Entitlements staging source.

- source repository: `jan2xo/bke-digital-solutions`
- certified extraction-readiness candidate: `c807dc67fbb0964044a91de8c0eda0446279e401`
- staging capability: `bke.entitlements.durable-right-grant.v1`
- source migration: `v2/modules/entitlements/prisma/migrations/0001_entitlements_durable_right_baseline/migration.sql`

Package-owned contracts, logic, Prisma schema/repository, migration, manifest, tests, and boundary documentation are copied from the certified staging source. The source migration is preserved byte-for-byte.

Layout-only adaptations:

- staging `test/` becomes package `tests/`
- staging migration directory becomes package `migrations/`
- package `prisma.config.ts` points Prisma at package `migrations/`
- standalone package metadata, README, and CI/release wiring are added
- persistence certification expects Prisma's standalone `_prisma_migrations` ledger rather than the Digital Solutions module compositor ledger

Digital Solutions host `module.ts` and host composition tests are not package business implementation and are deliberately excluded.

No Payment, Commerce, Licensing, Distribution, or frontend behavior is introduced by extraction. `Entitlement != License`.
