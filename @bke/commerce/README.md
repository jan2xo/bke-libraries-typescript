# @bke/commerce

Reusable BKE Commerce capabilities for purchase-plan pricing and lookup, offer redemption, order/invoice creation, checkout orchestration through Commerce-owned ports, transaction-safe subscription renewal planning, subscription lifecycle persistence, payment-outcome reaction, and reaction to verified settlement.

Commerce owns the renewal WHY through `bke.commerce.subscription-renewal-plan.v1`: renewal start selection, UTC interval math, reminder timing, and promotional-cycle consumption. Consumers may execute the returned plan inside their own transaction without duplicating those commercial decisions. The lifecycle capability and standalone PostgreSQL adapter consume that same plan.

Commerce also owns commercial reaction intent for paid, failed, and refund outcomes. Provider verification and payment facts remain Payments-owned; email dispatch, audit persistence, Licensing execution, and cross-domain transaction orchestration remain outside this package.

Commerce owns only its commercial contracts, logic, and persistence. Accounts, Legal, Payments, Entitlements, and Licensing are host-composed dependencies and are not package dependencies.
