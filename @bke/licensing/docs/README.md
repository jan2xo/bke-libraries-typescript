# Licensing V2 staging

## Ownership

Licensing owns runtime license state and license-local behavior. The current isolated baseline owns:

- `License`
- `LicenseEvent`
- `LicenseAssignment`
- `DeviceActivation`
- `LicenseLeaseRecord`
- `CommercialLeaseOperation`

Foreign domain identifiers (`accountId`, `orderId`, `orderItemId`, `productId`, `editionId`, `purchasePlanId`, `subscriptionId`, `userId`) are opaque strings. Licensing does not model or foreign-key Accounts, Identity, Commerce, Product/Catalog, or Distribution persistence.

`TrialGrant` is not owned here; V1 trial orchestration crosses Commerce and Licensing and will be classified separately when the Entitlements boundary is established. `DownloadGrant` belongs to Distribution even though it references a license ID.

## First certified seam: License Key Reveal

Capability: `bke.licensing.license-key-reveal.v1`

Host prerequisites remain outside Licensing:

1. same-origin request enforcement;
2. recent Identity authentication;
3. current Legal acceptance;
4. Accounts authorization for `REVEAL_LICENSE` and the target account.

The Licensing capability then:

1. scopes the license by opaque `licenseId + accountId`;
2. rejects missing encrypted key material;
3. decrypts the existing V1-compatible AES-256-GCM ciphertext using the injected license pepper;
4. sets `keyRevealedAt` only on the first successful reveal;
5. appends `CUSTOMER_REVEALED` on every successful reveal;
6. returns the plaintext key only after persistence succeeds.

No license status restriction is introduced because the V1 reveal route did not apply one after account authorization.

## Extraction direction

The module is staged to become `@bke/licensing`. Package-owned source must remain free of Next.js, Digital Solutions aliases, sibling-domain persistence, and application environment imports. The eventual Digital Solutions `module.ts` remains a thin host adapter, matching Identity and Accounts.
