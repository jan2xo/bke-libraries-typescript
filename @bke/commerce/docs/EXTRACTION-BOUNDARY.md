# Commerce Extraction Boundary

`@bke/commerce` owns reusable commercial contracts, logic, Commerce-private PostgreSQL repositories/schema/migrations, package manifest, and capability tests.

Digital Solutions retains the host adapter in `v2/modules/commerce/module.ts`. The host adapter is the only place that binds Commerce ports to Accounts, Legal, Payments, and Entitlements capabilities.

## Extractable surface

- `contracts/**`
- `logic/**`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/repositories/**`
- `module.manifest.ts`
- package-owned behavior/PostgreSQL tests
- this documentation

## Host-only surface

- `module.ts`
- Digital Solutions composition tests and consumer-adoption certification
- application routes and HTTP policy

## Forbidden reusable dependencies

The extractable surface must not import:

- `@bke/*` sibling libraries;
- Digital Solutions app aliases (`@/`);
- Next.js/server-only APIs;
- `v2/platform`, `v2/apps`, or host contracts outside the module;
- another module's Prisma schema, migrations, repository, or generated client.

Cross-capability interactions use Commerce-owned ports. The host adapter resolves concrete Accounts, Legal, Payments, and Entitlements capabilities.

## Commerce persistence ownership

Only Commerce business models belong in the package schema:

- `Price`
- `PurchasePlan`
- `DiscountOffer`
- `OfferRedemption`
- `Order`
- `OrderItem`
- `Invoice`
- `InvoiceLine`

Commerce migrations remain exactly:

- `0001_commerce_purchase_plan_baseline`
- `0002_commerce_offers_redemptions`
- `0003_commerce_orders_invoices`

No cross-module foreign keys or Prisma relations are allowed.
