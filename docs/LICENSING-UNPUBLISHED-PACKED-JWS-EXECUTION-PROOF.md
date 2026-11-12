# Licensing 0.10.0 unpublished package: executable JWS consumer proof

**Owner:** bke-libraries-typescript / @bke/licensing. **Intent:** prove that a blank consumer installed from the *CI-packed* `bke-licensing-0.10.0.tgz` can actually issue and verify account-product Ed25519 compact JWS, and fail closed on tampering, revoked/unknown key, expired, wrong context. Prior package smoke checked exported functions but not their runtime behavior.

## BKE CERTIFICATION PLAN

**Required (exact PR HEAD):** `licensing-package` via owner-only `/certify licensing-package <exact-head>` dispatch; `licensing-policy-guard` PR-safe check. The Licensing source test and commercial-context test previously certified unchanged source/behavior at library main `bade2f348a54086c368b9afedfb8769dfa85f9fd`; this intent changes *only* the package smoke/certification workflow and accompanying explanatory docs. No rerun of unaffected source/other library owners.

**Proof:** test-only generated Ed25519 signing key, resulting product claims, trusted public-key map, exact issuer/audience/account/product/session/thumbprint/action binding; invalid context, tampered compact bytes, forged signer, unknown/revoked kid, verify-only rotation, expired time and invalid claims all rejected. This code runs in isolated `npm install` consumer of the npm tarball and is not shipped in `@bke/licensing`.

**Provenance:** preserve exact run HEAD, tree, tarball SHA-256, tag-collision refusal, locked package/lockfile 0.10.0, immutable unpublished CI artifact, and all legacy consumer smoke. Successful CI is neither a GitHub release nor a signed attestation.

**Not required:** DS, Licensing Agent, Launcher, product/installer, database/security mutation, production, live keys or package release. Immutable package/version/source continues `0.10.0` candidate, but workflow source changes require new exact-head artifact provenance.

**PRODUCTION/PUBLICATION LOCKED:** no tag, release, registry publication, production signer, live DB, PayMongo, Resend, installer/catalog activation, force push.
