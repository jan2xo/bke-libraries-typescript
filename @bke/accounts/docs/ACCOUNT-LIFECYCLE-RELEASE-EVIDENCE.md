# Account Lifecycle Release Evidence

## Commercial Licensing composition gap

Commercial Licensing needs the factual lifecycle state of a `CustomerAccount` without applying caller authorization semantics. The existing Accounts access capability is intentionally principal-aware and therefore is not the owner-domain fact read used for commercial Licensing composition.

## Owner contract

`bke.accounts.account-lifecycle.v1` is keyed by exact `accountId` and returns only the Accounts-owned factual lifecycle snapshot:

- `accountId`
- `lifecycleState`

The result surface is `FOUND | NOT_FOUND | FAILED`.

It does not require `principalId`, make an authorization decision, query Identity, query Licensing, or delegate Accounts persistence to the host.

## Persistence boundary

The PostgreSQL implementation reads the existing Accounts-owned `CustomerAccount.lifecycleState`. No schema or migration is added by this capability.

Commercial Licensing consumes the public owner fact; it must not reconstruct `CustomerAccount` lifecycle with host SQL.

## Release identity

This Accounts capability is released as `@bke/accounts` `0.3.0`.

The release candidate workspace lock is reconciled against the already-published dependency-layer identities:

- `@bke/accounts` `0.3.0`
- `@bke/catalog` `0.2.0`
- `@bke/commerce` `0.5.0`
- `@bke/licensing` `0.5.0`

Inherited Catalog, Commerce, and Licensing manifests are synchronized byte-for-byte with canonical `main`; they are not part of the Accounts feature ownership surface.

## Merge gate

Merge only after the exact final PR head passes Accounts source/persistence certification, Accounts packed-consumer certification, and every other workflow registered for that exact SHA. After merge, `accounts-v0.3.0` must target the merge SHA and its released tarball digest must match the certified candidate artifact.
