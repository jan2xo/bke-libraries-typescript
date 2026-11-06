# @bke/commerce

Reusable BKE Commerce capabilities for purchase-plan pricing and lookup, offer redemption, order/invoice creation, checkout orchestration through Commerce-owned ports, transaction-safe subscription renewal planning, subscription lifecycle persistence, payment-outcome reaction, and reaction to verified settlement.

Commerce owns the renewal WHY through `bke.commerce.subscription-renewal-plan.v1`: renewal start selection, UTC interval math, reminder timing, and promotional-cycle consumption. Consumers may execute the returned plan inside their own transaction without duplicating those commercial decisions. The lifecycle capability and standalone PostgreSQL adapter consume that same plan.

Commerce also owns commercial reaction intent for paid, failed, and refund outcomes. Provider verification and payment facts remain Payments-owned; email dispatch, audit persistence, Licensing execution, and cross-domain transaction orchestration remain outside this package.

Commerce owns only its commercial contracts, logic, and persistence. Accounts, Legal, Payments, Entitlements, and Licensing are host-composed dependencies and are not package dependencies.

### Payment Intent checkout

`bke.commerce.payment-intent-checkout.v1` reuses Commerce's canonical account, legal, order, renewal, offer, and zero-payment checkout sequence while returning a Payment Intent snapshot instead of hosted-checkout fields. The host supplies the expected provider, live/test mode, and explicit allowed payment methods through trusted constructor policy. The result exposes the intent identity, client key, lifecycle state, and any provider next-action details required by the consumer.

Payment Intent lifecycle state is not financial settlement evidence. Commerce does not settle or fulfill an order from an intent status; provider-verified payment facts remain Payments-owned. The existing `bke.commerce.checkout-orchestration.v1` contract and hosted-checkout result remain available unchanged. This Payment Intent capability is one-shot order creation: it does not resume a previously created order. If an initial Payment Intent call is in progress or has an uncertain outcome, a host retry through this capability may receive `ORDER_CONFLICT` from canonical order creation. The host owns recovery by looking up the existing order by its canonical source and asking Payments to resume the same source; it must not create a second order or infer financial settlement from lifecycle state.
