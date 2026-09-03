# Catalog Extraction Boundary

Catalog owns reusable Product and Edition identity/snapshot behavior.

## Extractable to `@bke/catalog`

- `contracts/**`
- `logic/**`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/repositories/**`
- `module.manifest.ts`
- Catalog behavior and PostgreSQL certification tests

## Digital Solutions host-only

- `module.ts`
- standalone/composition wiring
- App Router / HTTP / UI consumers
- package adoption and retirement certification

## Owned persistence

Exactly two Prisma models:

1. `CatalogProduct`
2. `CatalogEdition`

Exactly one current migration:

1. `0001_catalog_product_edition`

The only relational persistence link is `CatalogEdition.productId -> CatalogProduct.id`, which is entirely inside Catalog ownership.

Catalog must not create foreign keys or repository reach-through to Commerce, Payments, Entitlements, Licensing, Distribution, Accounts, Identity, or Legal.

## Standard product kinds

The v1 Catalog contract recognizes:

- `SOFTWARE`
- `SAAS`
- `HYBRID`
- `SCRIPT`
- `DIGITAL_ASSET`

The persistence column is a string rather than a PostgreSQL enum so later Catalog-kind evolution does not inherently require a database enum migration.

## Ownership rule

Catalog describes **what the product/edition is**.

Commerce describes **how it is commercially sold**.

Entitlements describes **what durable right was granted**.

Licensing describes **what running software may enforce/unlock**.

Distribution describes **which bytes/assets may be delivered**.
