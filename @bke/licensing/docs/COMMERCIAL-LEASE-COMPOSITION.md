# Commercial Lease Composition Evidence

## Canonical V1 source

Protected Digital Solutions V1 lineage:

- repository: `jan2xo/bke-digital-solutions`
- commit: `1e314d89e5310e3ae8e3bebeaf7feef00a5c014b`
- route: `app/api/licenses/lease/route.ts`
- policy service: `lib/licensing/commercial-lease.ts`

The route is transport/mechanical orchestration. Commercial Licensing policy and decision precedence live in the Licensing service.

## V1 decision precedence

The canonical library preserves this order:

1. license exists; account lifecycle is `ACTIVE`; license status is `ACTIVE`; license is not expired
2. commercial operation existence/create-for-activation
3. operation license match, completed replay/input checks, and action match
4. renewal subscription eligibility
5. transfer eligibility
6. requested product-version syntax
7. exact requested active software-version eligibility
8. accepted-version range policy
9. external product identity availability
10. activation limits, lease lifecycle, signing, and persistence

Accepted-version range evaluation is intentionally not precomputed by a foreign owner or host. Licensing evaluates the Catalog-owned minimum/maximum facts at the V1 decision point.

## Owner fact graph

### Licensing

Licensing owns and supplies license facts keyed by the license-key hash, including:

- license id/status/expiry
- account id
- subscription id
- Catalog product id
- order item id
- seat/device limits

`orderItemId` is preserved through `CommercialLicenseContext` because V1 TRANSFER resolves the Commerce order-item policy from `license.orderItemId`.

### Accounts

Accounts supplies the factual account lifecycle state through `bke.accounts.account-lifecycle.v1`.

Licensing does not query Accounts persistence directly and does not require an Identity principal to obtain this fact.

### Commerce

Commerce supplies:

- subscription status
- order-item policy facts used for TRANSFER

Commerce owns these stored facts; Licensing owns renewal/transfer policy decisions that consume them.

### Catalog

Catalog supplies commercial software-version facts for the exact requested version:

- external product id
- exact requested active-version eligibility
- minimum accepted version
- maximum accepted version

Catalog does not decide the accepted-version policy. Licensing applies its canonical semver policy after V1 operation/renewal/transfer precedence and exact active-version eligibility.

## Boundary rule

`createCommercialLicenseContextProvider(...)` composes only public owner-domain capabilities into a `CommercialLicenseContext`.

The composition boundary must remain:

- no foreign-domain SQL from Licensing
- no Accounts/Commerce/Catalog persistence reach-through
- no Identity lookup for account lifecycle
- no host-owned commercial Licensing policy
- no host reconstruction of `orderItemId` or accepted-version decisions

The host may wire capability implementations together, but the policy-bearing composition and error/decision precedence remain owned by `@bke/licensing`.

## Release candidate

This composition closure is the `@bke/licensing` **0.5.0** release candidate. Its final certification must include source behavior, TypeScript, existing Prisma/PostgreSQL gates, exact V1 precedence tests, owner-fact assembler tests, packed blank-consumer installation, and the commercial-context package smoke gate on one exact Git SHA.
