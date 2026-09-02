# Payments — Verified Provider Event Ingestion Boundary

Capability: `bke.payments.provider-event-ingestion.v1`

## WHAT I NEED

- raw provider request body bytes
- request headers required by the provider verifier
- an injected provider-specific event verifier/parser

The verifier must authenticate the provider delivery before returning a normalized event.

## WHAT I DO / WHAT I OWN

- fail closed when authenticity verification/parsing fails
- normalize the verified provider event
- hash the exact received payload bytes
- derive a normalized event fingerprint
- durably record one provider event per `(provider, eventId)`
- treat an exact replay as `EXISTING`
- reject conflicting reuse of the same provider event ID as `EVENT_CONFLICT`
- preserve normalized payment/refund references, amount/currency, livemode, occurrence time, and received time
- accept verified `unknown` event types without inventing business semantics
- own private `PaymentProviderEvent` persistence with no cross-module foreign keys

Every delivery is independently verified before replay lookup. Replay protection must never become a shortcut around provider authenticity verification.

## WHAT I GIVE

A durable **verified provider-event fact**:

- Payments-owned provider-event record ID
- provider + provider event ID
- normalized event type and raw type
- opaque provider payment / checkout / refund references when present
- opaque commercial reference when present
- optional amount/currency
- livemode
- occurredAt / receivedAt

## What this DOES NOT mean

A verified `payment.paid` event is evidence emitted by the payment provider. This capability does **not** by itself:

- mark a Commerce Order `PAID`
- finalize an Invoice
- issue an Entitlement
- create or activate a License
- send a receipt
- run offer-redemption logic
- infer that all business-level settlement invariants are satisfied

A later Payments settlement-fact capability must reconcile a verified provider event against the expected payment attempt/commercial evidence before publishing a business-consumable settlement fact.

## Event vocabulary evidenced by V1

- `payment.paid`
- `payment.failed`
- `payment.refunded`
- `payment.refund.updated`
- `unknown`

Unknown verified events are intentionally retained and replay-protected for forward compatibility and auditability, but have no implicit settlement meaning.
