# @bke/commerce

Reusable BKE Commerce capabilities for purchase-plan pricing and lookup, offer redemption, order/invoice creation, checkout orchestration through Commerce-owned ports, reaction to verified settlement, edition-plan management, and payment-outcome reaction.

Commerce owns only its commercial contracts, logic, persistence, and the decision policy for how commercial order/payment/refund state reacts to already-verified provider outcomes. Accounts, Legal, Payments, Entitlements, Licensing, Notifications, and provider transport remain host-composed dependencies and are not package dependencies.
