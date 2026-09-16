# Commerce 0.12 convergence boundary

This candidate is the clean current-main successor to the unique owner behavior previously staged across draft PRs #55, #58, and #60.

It intentionally does not inherit their stale branch ancestry or unreleased version sequence.

## Included owner policy

- paid-payment commercial reaction intent
- failed-payment commercial reaction intent
- refund pending/failed/succeeded commercial reaction intent
- subscription start and renewal lifecycle behavior
- UTC period and reminder calculation
- renewal start = max(existing current-period end, now)
- bounded promotional-cycle consumption
- pure `planCommerceSubscriptionRenewal(...)` for in-transaction host composition

## Boundary

No Payments provider verification, host Prisma import, cross-library dependency, email dispatch, audit persistence, Licensing execution, production deployment, or production database mutation belongs in this package change.
