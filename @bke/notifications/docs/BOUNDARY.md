# Notifications boundary

Notifications owns the transport-neutral decision/intent primitive.

It accepts source/event identity, audience, content, context, idempotency metadata, and optional eligibility/expiry facts. It returns a normalized notification intent or an explicit suppression/failure result.

## Owned
- notification audience semantics
- notification content/category/priority normalization
- trigger/context metadata
- eligibility and expiry suppression
- idempotency metadata

## Not owned
- Accounts/Identity/Commerce persistence
- recipient lookup databases
- UI banners, toasts, inbox rendering
- email/SMS/push/Telegram/Viber/Desktop transports
- provider credentials
- durable delivery receipts/read state/dedupe persistence in v0.1.0

Hosts and transport adapters consume the package output and decide how the intent is rendered or delivered.
