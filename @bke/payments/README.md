# @bke/payments

Reusable BKE Payments capability library extracted from Digital Solutions V2.

Certified surfaces:
- checkout-attempt creation and durable idempotency
- verified provider-event ingestion and replay protection
- commercial provider-event matching against host-supplied order facts
- evidence-based settlement facts
- refund initiation with atomic cumulative refund capacity
- reconciliation of settled Payments facts against provider state
- concrete PayMongo protocol adapter behind generic provider ports

## Commercial event matching

`bke.payments.commercial-event-match.v1` owns the provider-event matching policy that decides whether checkout, commercial reference, amount, and currency facts agree before the host applies a payment outcome. The host supplies already-loaded commercial order facts from its existing transaction; Payments does not query or own Commerce tables.

This capability intentionally covers `payment.paid`, `payment.failed`, and `payment.refund.updated` matching semantics. It preserves the legacy refund rule that a missing event currency is acceptable only when an existing payment is known. Settlement mutation, order/invoice mutation, subscription lifecycle, Licensing mutations, email, audit, and cross-domain transaction composition remain outside Payments.

Payments owns provider interaction and Payments-local facts plus provider-event matching decisions. It does not mutate Commerce Orders/Invoices, Entitlements, Licensing, Accounts, or Legal state.
