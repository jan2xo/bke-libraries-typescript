# Commerce subscription status lookup

This read-only capability exposes the Commerce-owned subscription status and current period by opaque subscription ID. It returns `FOUND`, `NOT_FOUND`, or typed persistence/input failure. It performs no expiry, renewal, or status interpretation.

This is a fresh module-owned baseline, not a migration of an existing V1 Subscription table or production data. Account/product/edition and other IDs remain opaque references; this slice adds no relationship resolution or data import. It does not establish complete V1 subscription lifecycle parity. Host composition/adoption remains separate.
