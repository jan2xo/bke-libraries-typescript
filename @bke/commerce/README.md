# @bke/commerce

Reusable BKE Commerce capabilities for purchase-plan pricing and lookup, offer redemption, order/invoice creation, checkout orchestration through Commerce-owned ports, transaction-safe subscription renewal planning, and reaction to verified settlement.

Commerce owns the renewal WHY: renewal start selection, UTC interval math, reminder timing, and promotional-cycle consumption. Consumers may execute the returned plan inside their own transaction without duplicating those commercial decisions.

Commerce owns only its commercial contracts, logic, and persistence. Accounts, Legal, Payments, Entitlements, and Licensing are host-composed dependencies and are not package dependencies.
