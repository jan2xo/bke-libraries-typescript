# Commercial Context Release Evidence

Protected V1 source of truth: `jan2xo/bke-digital-solutions` at `1e314d89e5310e3ae8e3bebeaf7feef00a5c014b`.

The protected V1 lease route is mechanical. Commercial decision policy belongs to the commercial Licensing service, and the reusable library must preserve that ordering while obtaining sibling-owned facts only through public owner-domain capabilities.

## V1 decision precedence preserved

The commercial lease decision remains ordered as follows:

1. license/account/license-expiry validity
2. operation existence, replay, and action checks
3. renewal eligibility
4. transfer eligibility
5. requested-version syntax
6. exact active requested-version eligibility
7. accepted-version range policy
8. external product identity
9. activation limits and lease lifecycle

Accepted-version range evaluation must not be pre-decided by the host or by the Catalog fact provider. Licensing executes `isVersionAccepted(...)` at the exact policy decision point after operation, renewal, transfer, requested-version syntax, and exact active requested-version eligibility checks.

## Owner-fact composition

`createCommercialLicenseContextProvider(...)` assembles factual commercial context through structural ports without sibling persistence reach-through.

The composition consumes only owner-domain facts:

- Licensing: license snapshot and Licensing-owned policy/state facts
- Accounts: principal-free account lifecycle fact
- Commerce: subscription status and exact `OrderItem -> policyId` fact
- Catalog: external product identity, accepted-version bounds, and exact active requested-version fact

The assembled context carries the exact license `orderItemId` needed for Commerce transfer-policy lookup and the accepted-version minimum/maximum facts needed by Licensing's own semantic policy.

## Transfer boundary

For `TRANSFER`, Licensing preserves the already-certified V1 metadata coercion and decision precedence. `orderItemId` is carried as an opaque sibling-owner reference so the composition root can invoke Commerce's public order-item policy fact capability. Licensing does not query Commerce tables, Commerce does not own Licensing policy, and the host must not reconstruct this gate with SQL or duplicate business policy.

## Failure boundary

Missing or failed required owner facts remain fail-closed according to the commercial lease contract. The context provider does not convert factual lookup failure into host-owned policy and does not bypass the established V1 error precedence.

## Persistence boundary

This composition adds no foreign schema ownership, no sibling database access, no new global Prisma authority, and no host-owned business-logic workaround. Each library remains responsible for its own persistence and public capability surface.

## Final release vector

This certifying branch is reconciled directly on canonical `main` and carries:

- `@bke/accounts` `0.3.0`
- `@bke/catalog` `0.2.0`
- `@bke/commerce` `0.5.0`
- `@bke/licensing` `0.6.0`

The root workspace lock must match those exact package identities. Existing immutable releases, including `licensing-v0.5.0`, must not be moved or recreated.

The complete commercial-context composition is released only as `@bke/licensing` `0.6.0` after this exact PR head passes all workflows registered for that SHA, including Licensing source/persistence certification, the packed Licensing consumer gate, and the dedicated packed commercial-context composition gate.

## Merge and release gate

Merge only with an expected-head guard after every workflow registered for the exact final PR head reports SUCCESS. After merge, `licensing-v0.6.0` must target the resulting main merge SHA, and the released `bke-licensing-0.6.0.tgz` digest must exactly match the certified PR candidate artifact digest.

No Digital Solutions host adoption and no production deployment are part of this release gate.
