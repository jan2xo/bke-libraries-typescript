# Notifications boundary

Notifications owns transport-neutral notification intent, audience, inbox visibility, and receipt-state policy.

It accepts source/event identity, audience, content, context, idempotency metadata, optional eligibility/expiry facts, and principal/account/admin context. It returns normalized notification snapshots and explicit policy outcomes.

## Owned
- notification audience semantics
- PRINCIPAL, ACCOUNT, ADMINISTRATORS, SEGMENT, ALL_USERS, ALL_ACTIVE_CLIENTS, and VISITOR audience types
- notification content/category/priority normalization
- trigger/context metadata
- eligibility and expiry suppression
- idempotency metadata
- durable notification snapshot contract
- inbox visibility policy
- UNREAD / READ / DISMISSED receipt-state semantics and transitions

## Not owned
- Accounts/Identity/Commerce persistence
- recipient lookup databases
- PostgreSQL, SQLite, Prisma, or migrations
- UI banners, toasts, inbox rendering
- email/SMS/push/Telegram/Viber/Desktop transports
- provider credentials
- host API authentication or authorization

Hosts implement persistence and recipient resolution while consuming these package-owned contracts and policies.
