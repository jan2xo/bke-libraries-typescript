# Transfer Order-Item Plumbing Evidence

Protected V1 source of truth: `jan2xo/bke-digital-solutions` at `1e314d89e5310e3ae8e3bebeaf7feef00a5c014b`, commercial lease transfer behavior.

## Composition fact that must survive

The transfer decision requires Commerce's exact stored `OrderItem.policyId`, and the license already carries the owner-neutral `orderItemId` needed to resolve that fact.

The commercial Licensing context must therefore preserve `orderItemId` from the resolved license snapshot and provide it to transfer eligibility together with the requested transfer `policyId`.

## Preserved transfer sequencing

For `TRANSFER`:

1. Licensing interprets the requested policy ID using the already-certified V1 metadata semantics.
2. The commercial context carries the license's exact `orderItemId` without normalization.
3. Transfer eligibility receives `{ licenseId, orderItemId, policyId }`.
4. The composition root can resolve `orderItemId -> policyId` through Commerce's public owner contract.
5. Licensing's already-certified transfer policy decision remains the authority for exact policy equality and `transferable === true`.
6. Missing, mismatched, or unavailable owner facts remain fail-closed as `TRANSFER_NOT_ALLOWED` according to the existing decision/error precedence.

Non-transfer operations must not call the transfer owner-fact resolver.

## Boundary

This plumbing adds no persistence, migration, Commerce query inside Licensing, or host SQL reconstruction. `orderItemId` is an opaque sibling-owner reference carried only so the composition root can invoke the Commerce public capability.

## Release-train decision

This PR is an intentionally unreleased intermediate on top of the released dependency layer:

- `@bke/accounts` `0.3.0`
- `@bke/catalog` `0.2.0`
- `@bke/commerce` `0.5.0`
- `@bke/licensing` `0.5.0`

The existing immutable `licensing-v0.5.0` tag must not be moved or recreated. This PR may merge with the Licensing manifest unchanged at `0.5.0`; its push package workflow may certify the merged package but must treat the existing tag as unchanged.

The final commercial-context composition PR must bump Licensing to `0.6.0`, certify the complete packed public surface, and create the next immutable release only after its exact-head matrix is GREEN.

## Merge gate

Merge only after the exact current-main PR head passes Licensing source/persistence, Licensing packed-consumer, and every other workflow registered for that same head SHA.
