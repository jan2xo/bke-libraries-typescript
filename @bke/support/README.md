# @bke/support

Reusable BKE Support domain capability extracted from Digital Solutions V1 semantics.

## What it needs

- a `SupportContextPort` that proves account access and supplies already-safe contextual snapshots for optional external Order/License references;
- a Support-owned persistence repository;
- host/platform dispatch of returned audit and notification intents.

## What it does

- creates customer tickets and exact `BKE-SUP-<year>-<10 chars>` public IDs;
- forces SECURITY tickets to URGENT;
- records PUBLIC/INTERNAL messages and support-domain events;
- prevents customer replies to RESOLVED/CLOSED tickets;
- moves customer replies to WAITING_ON_SUPPORT;
- applies admin state/priority/assignment/reply/note updates and lifecycle timestamps;
- exposes customer-safe and admin-complete ticket queries.

## What it gives

Typed Support ticket snapshots plus explicit audit/notification effects for host/platform adapters.

The package does **not** own Accounts, Orders, Licenses, Identity, email transport, audit persistence, or HTTP/rate-limit policy.
