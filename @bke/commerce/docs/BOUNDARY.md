# Commerce — V2 Ownership Boundary

Commerce owns the commercial transaction lifecycle. It is rebuilt capability-by-capability from V1 evidence rather than copying the V1 checkout service.

## What I need

`bke.commerce.purchase-plan-pricing.v1` needs only an immutable purchase-plan snapshot.

`bke.commerce.purchase-plan-lookup.v1` needs only Commerce-owned persistence. `editionId`, legacy `productId`, and legacy `licensePolicyId` remain opaque external identifiers; Commerce does not require or foreign-key Entitlements, Catalog/Product, or Licensing tables.

`bke.commerce.checkout-orchestration.v1` consumes only declared capability boundaries for:

- Accounts purchase authorization;
- Legal acceptance checking;
- Payments checkout-attempt creation.

Reusable Commerce logic sees Commerce-owned ports for those dependencies. Digital Solutions adapts the actual `@bke/accounts`, `@bke/legal`, and `@bke/payments` capabilities at composition time. Commerce never reaches through another module's Prisma client or tables.

Future Commerce capabilities may consume approved contracts for Catalog/Product identity, Entitlements grant requests, notification/email transport, or audit/event transport. Those dependencies remain capability contracts or ports.

## What I own / what I do

Commerce owns:

- `PurchasePlan` pricing terms and persistence;
- legacy `Price` compatibility during transition;
- `Cart` / `CartItem` only when a real consumer requires them;
- `Order` / `OrderItem` and immutable commercial snapshots;
- `Invoice` / `InvoiceLine`;
- `DiscountOffer` / `OfferRedemption`;
- `Subscription` scalar persistence and read-only status/period lookup; recurring lifecycle transitions remain unimplemented;
- commercial checkout orchestration and the commercial reaction to an already-verified Payments settlement fact.

Commerce currently provides deterministic purchase-plan pricing, PurchasePlan lookup, offer/redemption handling, Order+Invoice creation, and checkout orchestration.

Checkout orchestration:

1. requires Accounts `PURCHASE` authorization;
2. requires the declared Legal acceptance;
3. creates the Commerce-owned pending Order and draft Invoice;
4. returns `PAYMENT_NOT_REQUIRED` for a zero-total order without calling Payments;
5. otherwise asks Payments to create a checkout attempt using the created Order id as the commercial reference.

Commerce does not treat a provider response as settlement. A later commercial-settlement reaction must consume the already-reconciled Payments settlement fact before changing commercial state or requesting an Entitlement.

## What I give

Current public capabilities:

- `bke.commerce.purchase-plan-pricing.v1`
- `bke.commerce.purchase-plan-lookup.v1`
- `bke.commerce.offer-redemption.v1`
- `bke.commerce.order-invoice-creation.v1`
- `bke.commerce.checkout-orchestration.v1`

They return typed commercial facts/results. They do not expose database clients, provider credentials, V1 helpers, or another module's persistence.

## Explicit non-ownership

Commerce does **not** own:

- `Product` — Catalog/Product owns canonical product identity;
- `Edition` or durable rights — Entitlements owns those semantics;
- `LicensePolicy`, license keys, or device authorization — Licensing owns those semantics;
- `CustomerAccount`, membership, or account lifecycle — Accounts owns them;
- authentication/session state — Identity owns it;
- legal acceptance policy/persistence — Legal owns it;
- `PaymentCheckoutAttempt`, provider events, settlement facts, refunds, provider credentials, webhook verification, or payment-provider persistence — Payments owns them;
- entitlement issuance — Entitlements owns it;
- HTTP/same-origin/rate limiting/cookies — host/presentation/security boundary;
- email delivery or global audit persistence — host/provider capabilities;
- release artifacts, updates, distribution, or certification.

`OrderItem.entitlementSnapshot` is historical commercial evidence; its existence does not make Commerce the owner of Entitlements behavior.

## Capability attack order

1. Purchase Plan Pricing — CERTIFIED.
2. PurchasePlan persistence + legacy Price compatibility — CERTIFIED.
3. Offers / redemptions — CERTIFIED.
4. Order + invoice creation and immutable pricing snapshots — CERTIFIED.
5. Checkout orchestration through Accounts / Legal / Payments contracts — ACTIVE.
6. Commercial settlement reaction from a verified Payments settlement fact, with Entitlements handoff where required.
7. Subscription / renewal lifecycle only when a real V2 standalone consumer requires it.
8. Cart only when a real V2 consumer requires it.
9. Extraction hardening, standalone `@bke/commerce` adoption, and staging retirement after the owned seams are certified.

## Stop conditions

- no production PostgreSQL mutation;
- no changes to V1 behavior;
- no Product, Edition, or LicensePolicy ownership copied into Commerce;
- no direct Accounts/Identity/Legal/Payments/Entitlements/Licensing Prisma reach-through;
- no payment-provider implementation or payment persistence inside Commerce;
- no entitlement issuance inside Commerce;
- no frontend work in the backend capability attack;
- no Commerce extraction until public contracts and owned persistence seams are independently certified.
