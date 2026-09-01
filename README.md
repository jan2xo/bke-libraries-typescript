# BKE TypeScript Libraries

Canonical repository for reusable BKE TypeScript libraries.

## Package layout

Libraries live under their npm scope path:

```text
@bke/<package>/
```

Each package owns its contracts, domain logic, providers, persistence adapters, migrations, tests, and package documentation. Application-specific composition adapters remain in consuming applications.

## Engineering rule

A library must be independently certifiable before an application consumes it. Moving a capability into this repository must not require rewriting already-certified business logic.
