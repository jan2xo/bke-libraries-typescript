# Digital Solutions V1 Support parity

Source baseline: `jan2xo/bke-digital-solutions` commit `bd9b1b3d88fbbd882ab04eb60aea96625c25b2d3` (`lib/support.ts` and direct production routes).

Preserved semantics:

- ticket public IDs use `BKE-SUP-<UTC year>-<10 uppercase UUID chars>`;
- account/context authorization is required before creation; missing Order/License context is rejected;
- SECURITY category forces `URGENT` and emits `SECURITY_REPORT_CREATED`;
- ordinary creation emits `TICKET_CREATED`;
- first customer message is PUBLIC and `lastCustomerReplyAt` is set on creation;
- customer access includes creator access plus externally authorized account membership;
- customer replies are rejected for RESOLVED/CLOSED tickets and otherwise set `WAITING_ON_SUPPORT`;
- admin PUBLIC replies and INTERNAL notes remain distinct;
- admin state timestamps are written when entering RESOLVED, CLOSED, or ESCALATED;
- customer projections hide INTERNAL messages, events, and assignment information;
- admin projections include all messages, events, and assignment information;
- support-specific audit and notification meaning is emitted as typed effects, while durable audit/email transport remains host/platform ownership.

Deliberate modular boundary:

The V1 helper directly queried CustomerAccount, Order, License and User data. `@bke/support` does not import or persist those domains. A `SupportContextPort` supplies authorization/context, and account membership identifiers are supplied to customer query/reply operations. This removes Support's V1 cross-domain Prisma reach-through without migrating excluded domains into this package.
