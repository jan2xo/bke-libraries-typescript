# Consuming @bke/accounts

## Responsibility split

`@bke/accounts` owns Accounts domain contracts, business logic, providers, PostgreSQL repositories, Prisma schema, migrations, and domain certification. The host owns HTTP/Next.js mapping, sessions/cookies, Identity principal verification/enrichment, Legal acceptance, email transport, audit transport, Commerce, Licensing, and application composition.

## Direct capability composition

Import the contract/capability factory and its PostgreSQL repository from package subpaths. Construct the repository with the application's Accounts database connection string, construct any package provider required by the capability, then register the resulting capability in the host composition root. Do not copy package logic back into the application.

```ts
import { createAccountsAccountAccessCapability } from "@bke/accounts/logic/account-access";
import { createPostgresAccountsAccountAccessRepository } from "@bke/accounts/prisma/repositories/postgres-account-access-repository";

const accountAccess = createAccountsAccountAccessCapability(
  createPostgresAccountsAccountAccessRepository(process.env.DATABASE_URL!),
);
```

Other Accounts capabilities follow the same contract + logic factory + required provider/repository pattern. The package manifest enumerates certified capability IDs.

## Prisma / migrations

The package owns `prisma/schema.prisma` and `migrations/`. Run package Prisma scripts with `DATABASE_URL` configured. Consumers must not reconstruct Accounts tables in a global business schema.

## Cross-domain composition

Identity principal IDs enter Accounts as opaque strings. The host proves principal existence/email state where required. Registration remains Identity + Accounts + Legal composition. Commerce and Licensing consume Accounts authorization results instead of duplicating the role/capability matrix. Audit intents returned by Accounts are transported by the host.

## Upgrade proof

Certify the standalone package first, then prove the consuming host adapter/composition against that exact package candidate. Host tests prove wiring and compatibility; they do not re-prove package-owned domain invariants.
