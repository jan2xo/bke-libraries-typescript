# @bke/payments

Reusable BKE Payments capability library extracted from Digital Solutions V2.

Certified surfaces:
- checkout-attempt creation and durable idempotency
- verified provider-event ingestion and replay protection
- evidence-based settlement facts
- refund initiation with atomic cumulative refund capacity
- concrete PayMongo protocol adapter behind generic provider ports

Payments owns provider interaction and Payments-local facts only. It does not mutate Commerce Orders/Invoices, Entitlements, Licensing, Accounts, or Legal state.
