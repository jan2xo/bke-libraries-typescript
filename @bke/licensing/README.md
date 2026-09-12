# @bke/licensing

Reusable BKE Licensing capability library.

The package owns licensing policy, contracts, persistence adapters, and licensing-specific operational state. Consumers may compose package capabilities inside broader application transactions when cross-domain atomicity must remain host-owned.

## Entitlement management

`bke.licensing.entitlement-management.v1` owns validation and normalization for license issuance and subscription-license renewal intent, including renewal expiration semantics and renewal-operation facts.

The current capability intentionally exposes a repository port so a consumer such as BKE Digital Solutions can bind Licensing mutations into an existing cross-domain transaction without moving Commerce or host orchestration into this package.

A standalone PostgreSQL repository for this capability is not currently shipped. Do not claim persistence-complete or release-ready entitlement-management support until that adapter is certified.
