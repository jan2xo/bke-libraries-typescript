# @bke/accounts

Reusable BKE Accounts capability library.

This package was physically extracted from certified Digital Solutions V2 Accounts staging at source commit `0e6afbf92bf08762e10892643e99b607332eac61`. Business logic, contracts, providers, PostgreSQL repositories, Prisma schema, and baseline migration are package-owned. Digital Solutions host composition is intentionally excluded.

## Install

Pin the exact certified package artifact/version used by the host. This package is not asserted to be publicly published to npm.

## Use

Import contracts and capability factories from package subpaths, create the required providers/repositories, then wire those capabilities in the consuming application's composition root. See `docs/USAGE.md`.

`bke.accounts.account-lifecycle.v1` is the principal-free owner-domain fact surface for reading an account's current lifecycle state by `accountId`. Use `bke.accounts.account-access.v1` separately when caller authorization is actually required; do not use authorization as a substitute for lifecycle fact lookup.

## Persistence

Accounts owns `CustomerAccount`, `OrganizationProfile`, `Membership`, and `Invitation`. Identity principal IDs are opaque external IDs; there is no Identity `User` relation or foreign key. Apply package-owned migrations from `migrations/` before using PostgreSQL repositories.
