# Payments extraction boundary

Payments is ready to be treated as a reusable library candidate only if the package-owned surface remains independent from Digital Solutions host/application code.

## Package-owned surface

The extraction candidate includes:

- `contracts/`
- `logic/`
- `providers/`
- `prisma/`
- `prisma.config.ts`
- `module.manifest.ts`
- package-owned tests and documentation

The reusable surface currently proves:

1. `bke.payments.checkout-attempt.v1`
2. `bke.payments.provider-event-ingestion.v1`
3. `bke.payments.settlement-fact.v1`
4. `bke.payments.refund-initiation.v1`
5. the concrete PayMongo adapter implementing the generic checkout, event-verifier, and refund provider ports

## Host-only surface

`module.ts` is the Digital Solutions composition adapter. It wires PostgreSQL repositories and provider ports into the host capability system and must not become package business authority.

`test/module-composition.test.ts` is a Digital Solutions host-composition test and is excluded from the reusable package-owned source boundary.

## Persistence ownership

Payments owns only:

- `PaymentCheckoutAttempt`
- `PaymentProviderEvent`
- `PaymentSettlementFact`
- `PaymentRefundOperation`

Payments must not add foreign Prisma models, cross-module relations, or references to Commerce, Entitlements, Licensing, Accounts, Legal, or other business tables.

## Allowed runtime dependencies

The reusable staging implementation may depend on:

- Node.js built-ins
- `pg`
- `prisma/config`
- `vitest` for certification sources
- platform-provided `fetch` / Web APIs used by the PayMongo adapter, with deterministic injected transport in tests

It must not import:

- Digital Solutions app aliases (`@/`)
- V2 host paths
- Next.js or `server-only`
- another `@bke/*` package
- the host `module.ts`
- undeclared third-party runtime dependencies

## Semantic boundary

Payments gives provider interaction and durable Payments facts. It does not own downstream business reactions.

A checkout `PENDING` is not settlement. A verified provider event is not settlement. A settlement fact is evidence, not permission for Payments to mutate Order, Invoice, Entitlement, License, Subscription, offer, or email state. Refund operations likewise remain Payments facts/provider operations; downstream refund reactions belong to their owning modules.

## Extraction lifecycle

This readiness gate does not itself extract or delete anything. After this boundary is GREEN:

1. extract the proven reusable surface to `@bke/payments`;
2. certify the standalone package and exact artifact;
3. route Digital Solutions to the package while staging remains present;
4. certify consumer adoption;
5. only then retire redundant V2 staging business implementation.
