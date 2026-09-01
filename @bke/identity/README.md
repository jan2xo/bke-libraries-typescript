# @bke/identity

Standalone BKE Identity capability library extracted from the certified Digital Solutions V2 Identity module.

`@bke/identity` owns Identity contracts, logic, providers, PostgreSQL repositories, Prisma schema/migrations, tests, and the Identity module manifest. Application-specific composition remains in the consuming host.

## Start here

- [`docs/USAGE.md`](./docs/USAGE.md) — how to install, compose, configure, migrate, certify, and upgrade the library from a consuming application.
- [`docs/EXTRACTION.md`](./docs/EXTRACTION.md) — extraction provenance, package boundary, and ownership rules.

The application-specific `module.ts` composition adapter is intentionally not part of this package. Consumers compose only the capabilities they need through the library's declared exports.
