# @bke/commerce

Reusable BKE Commerce capabilities for purchase-plan pricing and lookup, offer redemption, order/invoice creation, checkout orchestration through Commerce-owned ports, reaction to verified settlement, edition-plan management, payment-outcome reaction, and subscription lifecycle management.

Commerce owns only its commercial contracts, logic, persistence, and decision policy. The payment-outcome capability owns paid/failed/refund commercial mutation intent, including settlement after local cancellation. The subscription lifecycle capability owns subscription start/renewal period decisions, renewal reminder timing, expired-state reactivation, and bounded promotional-cycle consumption. Accounts, Legal, Payments, Entitlements, Licensing, Notifications, and provider transport remain host-composed dependencies and are not package dependencies.

The current convergence child stages `@bke/commerce 0.13.0` on top of the certified 0.12.0 edition-plan + failed/refund outcome + subscription-lifecycle line. It adds paid-outcome planning without reusing the distinct `0.11.0` candidate identity from the separate subscription-lifecycle lineage.
