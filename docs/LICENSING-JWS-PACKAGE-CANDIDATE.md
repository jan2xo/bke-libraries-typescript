# BKE Licensing JWS immutable package candidate — source-only

**Execution intent:** Make the already merged account-product Ed25519 JWS signer/verifier available as a *uniquely versioned, exact-source and SHA-256 attested CI package artifact*, without a GitHub Release, public package release, production signing, or consumer repin.

- Canonical library base: `28f08cd07071d00194dd672c6f186dd628e9803a`.
- Prior GitHub tag: `licensing-v0.9.0` is already published and immutable. Reusing 0.9.0 with newly merged JWS source is prohibited.
- Candidate semver: `0.10.0` in package.json **and** root npm lockfile workspace entry.
- Certification must bind actual package contents to exact admitted GitHub Actions source SHA + Git tree + tarball SHA-256; archive manifest and tarball as CI artifacts, not a release.
- Fail closed if candidate's tag already exists, if package and workspace lock disagree, or if checked-out HEAD differs from the workflow run's admitted source SHA.
- Existing `@bke/licensing` JWS contract/source vectors and legacy commercial lease interfaces stay unchanged. No new keys or runtime API.

## BKE CERTIFICATION PLAN

**Required:** `licensing` (JWS/legacy source and database regression), `context` (commercial host boundary), `package` (tarball, isolated blank consumer, content SHA provenance), and `policy` (no publish path/immutable version guard). Each exact-head workflow must PASS on the final source head; the package workflow is explicitly dispatched once by repository owner command.

**Not required:** other library modules, Digital Solutions, Agent, Launcher, product, installer/UTM, PayMongo, Resend, production. Source package boundary only; no consumer code changes.

**Production/release:** LOCKED. An explicitly authorized later *publication* intent must inspect these immutable artifacts and use protected GitHub release authority. A successful package workflow alone grants no publication permission.
