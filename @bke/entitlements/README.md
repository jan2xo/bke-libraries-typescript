# @bke/entitlements

Reusable BKE durable-right Entitlements capability.

Current capability:

- `bke.entitlements.durable-right-grant.v1`
- `bke.entitlements.durable-right-revocation.v1`

The package accepts already-authorized grant/revocation facts and owns durable-right state, idempotency, scope/grant evidence, revocation evidence, status, and validity.

Revocation is terminal in this capability wave: `ACTIVE → REVOKED`. A repeated revocation with the same reference/evidence is idempotent; a conflicting second revocation is rejected. Revocation never reactivates a right.

It does not decide Payment success, create billing subscriptions, create Licenses/runtime enforcement, create DownloadGrants, or own sibling-domain persistence.

`Entitlement != License`.
