# @bke/catalog

Reusable BKE Catalog capability for Product and Edition identity, lookup, management, product-deletion lifecycle policy, and module-owned PostgreSQL persistence.

Catalog answers **what the product or edition is** and owns Catalog-specific lifecycle decisions. It does not own Commerce pricing/orders, Payments, Entitlements, Licensing, Distribution, storage transport, or UI.

## Product deletion lifecycle

`catalog.product-deletion-policy.v1` owns deletion eligibility, exact-name confirmation, first-request timestamp preservation, product deactivation intent, cleanup-readiness ordering, finalization eligibility, and deletion audit-action vocabulary.

Consumers remain responsible for gathering dependency/resource facts, executing Prisma transactions, creating and processing storage-cleanup jobs, redaction, deleting persisted Catalog resources after authorization, and persisting audit records. Those are execution mechanics; the consumer must not re-invent the Catalog deletion decisions.

`@bke/catalog` 0.6.0 is the first release candidate where the full product-deletion request/finalization WHY boundary is package-owned; consumers retain only execution mechanics.

Standard v0.1.0 kinds: `SOFTWARE`, `SAAS`, `HYBRID`, `SCRIPT`, `DIGITAL_ASSET`.
