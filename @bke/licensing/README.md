# @bke/licensing

Reusable BKE Licensing capability library.

The package owns Licensing contracts, decision policy, licensing-specific persistence adapters where those adapters can remain domain-local, and licensing operational state. Consumers may compose package capabilities inside broader application transactions when cross-domain atomicity must remain host-owned.

## Entitlement management

`bke.licensing.entitlement-management.v1` owns validation and normalization for license issuance and subscription-license renewal intent, including renewal expiration semantics and renewal-operation facts.

The capability intentionally exposes a repository port. BKE Digital Solutions must bind that port to its existing cross-domain settlement transaction so Commerce settlement and Licensing issuance/renewal remain atomic. A standalone entitlement-management PostgreSQL adapter is therefore **not** required for this capability and must not be used to split that transaction merely to make the package look persistence-complete.

The combined entitlement-management draft stages `@bke/licensing 0.9.0`. Host-specific cryptography, transaction composition, payment facts, and Commerce orchestration remain consumer-owned HOW; Licensing continues to own the WHY of issuance and renewal policy.
