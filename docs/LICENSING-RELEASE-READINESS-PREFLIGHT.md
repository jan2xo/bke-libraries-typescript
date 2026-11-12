# Read-only Licensing package release-readiness preflight

**Owner:** BKE TypeScript libraries / `@bke/licensing`.
**Prior merged source:** `0a32358291789afcf1135cc9a4c9030d0505f047`.
**Previously certified JWS tarball:** `bke-licensing-0.10.0.tgz`, `sha256=4d2f8e4295effcfd4aa3b6492944e8dbba3ec75e86c83727a30daa74e4f75d60`, from explicit [package run #43153573142](https://github.com/jan2xo/bke-libraries-typescript/actions/runs/43153573142), producer HEAD `d6b0159d9c22e0f9e468040777ea4591953c89f6`.

## Intent and boundaries

Prepare a **read-only** release-readiness proof that binds the actual historical CI package tarball (not a rebuild substituted for the evidence) to the successful *same-repository* explicit package certification run and its exact source HEAD/Git tree/immutable package bytes. Repack independently from the present library main and fail closed unless the package SHA-256 and the complete package-source tree are unchanged, despite intervening CI-only changes.

The preflight must require exact main SHA as a user input, compare current GitHub remote main, explicitly validate producer run status/path/source, check artifact exists and is not expired, enforce package/lockfile version, and reject an already-present tag/release. Record a reproducible machine-readable readiness evidence file referencing artifact and SHA. Do not sign it or call it a signed attestation.

**Release authority is NOT granted.** This preflight cannot create a release, tag or package publication and receives only `contents: read` and `actions: read`. A future *distinct*, owner-explicit release intent will still need release-chain custody/authorization and potentially a separately certified publication workflow.

## BKE CERTIFICATION PLAN

- **Required on exact PR head:** cheap `library-intent-policy-guard` and a small deterministic unit test suite for the read-only artifact provenance comparator.
- **Future explicit post-merge evidence:** `licensing-release-readiness.yml` must be invoked on exact, verified `main` via `workflow_dispatch` (not auto-triggered by PR/push). The new workflow is not dispatchable until GitHub has admitted it on main. Do **not** claim a live preflight occurred based solely on a source guard/test.
- **Not required for this implementation:** full module/PG/packaging CI; no application or archive bits changed, existing package run #43153573142 and #94 vector proofs stay immutable; DS/Agent/Launcher/product/installer, production.

**LOCKS:** no GitHub release/tag, no software/installer/catalog publication, no production DB/Cloudflare/signing-key activity, no live PayMongo/Resend, no force push.
