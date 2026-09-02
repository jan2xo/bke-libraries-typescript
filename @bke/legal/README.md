# @bke/legal

Reusable BKE Legal acceptance capability extracted from Digital Solutions V2.

Certified staging source: `a69e983969c0c96480b6fda39d7405384f3effa0`.

## Boundary

- **What I need:** opaque principal/account IDs and exact legal document/version/rendered-content evidence.
- **What I own:** Legal document versions, acceptance records, validation, recording, lookup.
- **What I give:** `bke.legal.acceptance.v1`.

Checkout policy decides whether Legal is required. This package never fabricates acceptance for a `NOT_REQUIRED` path.
