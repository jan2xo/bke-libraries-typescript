# @bke/commerce

Reusable BKE Commerce capabilities for purchase-plan pricing and lookup, offer redemption, order/invoice creation, checkout orchestration, settlement reaction, payment-outcome reaction, edition-plan management, and subscription lifecycle policy.

Commerce owns commercial policy and commercial persistence only. Payments owns provider verification and payment facts; Licensing/Entitlements own their respective authorization and grant policy; the host composes these capabilities and executes cross-domain transactions.

## Transaction-safe subscription renewal

`planCommerceSubscriptionRenewal(...)` is a pure Commerce-owned decision surface for renewal timing and promotional-cycle consumption. It decides:

- renewal start as the later of the existing current-period end and `now`
- next UTC month/year period end
- renewal reminder date
- whether a settled promotional cycle is consumed
- the next consumed-cycle count

The PostgreSQL lifecycle adapter consumes the same planner. Hosts that already own a cross-domain transaction may call the planner directly and persist its result inside that transaction instead of duplicating Commerce business policy or opening a separate Commerce transaction.

## Payment outcomes

`bke.commerce.payment-outcome-reaction.v1` returns commercial mutation intent for paid, failed, and refund outcomes. It does not verify provider events, perform provider transport, mutate Payments state, dispatch email, write audit records, or execute Licensing operations.
