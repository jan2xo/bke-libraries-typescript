# Transfer Policy Release Evidence

Protected V1 source of truth: `jan2xo/bke-digital-solutions` at `1e314d89e5310e3ae8e3bebeaf7feef00a5c014b`, `lib/licensing/commercial-lease.ts`.

## Preserved V1 gate

For `TRANSFER`, commercial lease evaluation preserves this exact owner-fact sequence:

1. Operation metadata must contain a truthy `policyId` after V1 `String(...)` coercion.
2. Commerce resolves the license `orderItemId` to its exact stored `OrderItem.policyId`.
3. The stored policy ID must exactly equal the requested operation policy ID.
4. Licensing resolves `LicensePolicy` by that exact policy ID.
5. Transfer is allowed only when the resolved policy exists and `transferable === true`.

Missing item, missing policy, policy mismatch, empty requested policy ID, or `transferable !== true` fail closed as `TRANSFER_NOT_ALLOWED`.

The gate does not inspect order status, price, billing state, product equality, policy snapshot, policy name, seat/device limits, or policy rules.

## Ownership boundary

Commerce owns the factual `OrderItem -> policyId` lookup through `bke.commerce.order-item-policy-lookup.v1`.

Licensing owns `LicensePolicy.transferable`, transfer metadata interpretation, and the fail-closed decision through `bke.licensing.transfer-policy.v1`.

Licensing does not query Commerce tables. Commerce does not own Licensing policy. The host must not reconstruct either owner fact with SQL.

## Release correction

Earlier immutable tags `commerce-v0.4.0` and `licensing-v0.4.0` were published before this transfer-policy layer merged. They therefore do not represent this capability.

This layer is released as:

- `@bke/commerce` `0.5.0`
- `@bke/licensing` `0.5.0`

The branch also reconciles inherited `@bke/catalog` metadata to the already-published `0.2.0` release before merge. Package-lock workspace metadata therefore matches Catalog `0.2.0`, Commerce `0.5.0`, and Licensing `0.5.0` on the certifying head.

The final commercial-context composition layer must use a later Licensing version and must not reuse `0.5.0`.

## Certification requirement

Merge only after the exact final PR head passes the Commerce source/persistence gate, Commerce packed-consumer gate, Licensing source/persistence gate, Licensing packed-consumer gate, and the repository-wide PR workflow matrix that is registered for that same SHA.
