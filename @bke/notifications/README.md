# @bke/notifications

Transport-neutral BKE notification intent and inbox policy capabilities.

## WHAT I NEED
- source module/event identity
- audience selector
- notification content
- trigger/context
- idempotency key
- optional eligibility and expiry facts
- principal/account/admin context for inbox visibility
- current receipt state for read/dismiss transitions

## WHAT I DO
- validate and normalize notification intent
- preserve semantic audience targeting
- support PRINCIPAL, ACCOUNT, ADMINISTRATORS, SEGMENT, ALL_USERS, ALL_ACTIVE_CLIENTS, and VISITOR audiences
- materialize normalized durable notification snapshots
- decide whether a notification is visible to a principal
- own UNREAD, READ, and DISMISSED receipt-state transitions
- decide NOTIFY, DO_NOT_NOTIFY, FAILED, VISIBLE, or HIDDEN outcomes

## WHAT I GIVE
- `bke.notifications.intent.v1`
- `bke.notifications.inbox-policy.v1`

This package does not send email, SMS, push, Telegram, Viber, desktop notifications, or UI banners. It does not own customer/account databases, PostgreSQL/SQLite repositories, web routes, or rendering. Hosts persist package-owned snapshots and receipt state, resolve concrete recipients, and expose UI/API adapters.
