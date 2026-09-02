# @bke/entitlements

Reusable BKE durable-right Entitlements capability.

Current capability:

- `bke.entitlements.durable-right-grant.v1`

The package accepts an already-authorized source fact and owns only durable-right state, idempotency, scope/grant evidence, status, and validity.

It does not decide Payment success, create billing subscriptions, create Licenses/runtime enforcement, create DownloadGrants, or own sibling-domain persistence.

`Entitlement != License`.
