# Payments — Checkout Attempt Boundary

Capability: `bke.payments.checkout-attempt.v1`

## WHAT I NEED

An already-priced checkout request from an upstream commercial authority:

- opaque source/idempotency reference
- opaque commercial reference suitable for provider display/reconciliation
- positive amount in minor units
- ISO-style three-letter currency code
- payer snapshot needed by the provider
- line-item snapshot whose total exactly matches the requested amount
- an injected payment-provider adapter

Payments does **not** calculate prices, discounts, taxes, offers, or invoice totals.

## WHAT I DO / WHAT I OWN

- validate and normalize the checkout request
- idempotently claim one durable payment-attempt identity per source reference
- persist provider-independent attempt state
- call the injected provider using the durable attempt ID as the provider idempotency key
- bind the provider checkout identity/URL to the attempt
- preserve provider failure state for safe retry
- reject conflicting reuse of the same source reference
- own the private `PaymentCheckoutAttempt` table, migration, repository, contracts, logic, and tests while staged

A retry of a `CREATING` or `FAILED` attempt may call the provider again with the same durable provider idempotency key. A retry of a `PENDING` attempt returns the already-bound provider checkout without another provider call.

## WHAT I GIVE

On success:

- durable payment attempt ID
- source reference
- provider identity
- `PENDING` attempt state
- external provider checkout identity
- checkout URL
- amount/currency snapshot
- created timestamp

The result means only: **a provider checkout is ready/pending**.

It does **not** mean money settled.

## Explicit non-ownership

Payments checkout-attempt does not:

- create or price Commerce Orders
- finalize Invoices
- mark Orders `PAID`, `FAILED`, `REFUNDED`, or otherwise mutate Commerce state
- decide entitlement issuance/revocation
- create/revoke Licenses or device activations
- create/cancel billing Subscriptions
- issue email receipts
- own Accounts or Legal acceptance
- create Distribution grants
- infer settlement from a browser redirect

Verified provider-event ingestion and settlement facts are later Payments capabilities and must remain separate from downstream Commerce/Entitlements/Licensing reactions.

## Provider boundary

PayMongo is not embedded in this primitive. `PaymentsCheckoutProvider` is an injected port. Provider-specific HTTP/authentication/payment-method rules belong in a provider adapter and can be certified independently.

## Persistence boundary

`PaymentCheckoutAttempt` contains no foreign keys to Commerce, Accounts, Entitlements, Licensing, or any other module. Cross-domain references remain opaque strings.
