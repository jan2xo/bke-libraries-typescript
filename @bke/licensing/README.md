# @bke/licensing

Reusable BKE Licensing capability extracted from Digital Solutions V2.

Certified staging source: `1ca7abf353ffcce0f904c7b935763ad3f0c0616c`.

## Boundary

- **What I need:** opaque license/runtime identifiers and encrypted key material.
- **What I own:** licensing persistence, key-reveal policy, decryption and clock seams.
- **What I give:** `bke.licensing.license-key-reveal.v1`.

Entitlements and checkout orchestration stay outside this package.
