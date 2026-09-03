# @bke/notifications

Transport-neutral BKE notification intent capability.

## WHAT I NEED
- source module/event identity
- audience selector
- notification content
- trigger/context
- idempotency key
- optional eligibility and expiry facts

## WHAT I DO
- validate and normalize notification intent
- preserve semantic audience targeting
- decide `NOTIFY`, `DO_NOT_NOTIFY`, or `FAILED`

## WHAT I GIVE
- `bke.notifications.intent.v1`

This package does not send email, SMS, push, Telegram, Viber, desktop notifications, or UI banners. It does not own recipient databases or delivery persistence.
