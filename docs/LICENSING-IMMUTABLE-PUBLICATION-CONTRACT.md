# Immutable @bke/licensing publication contract — source-only, LOCKED

**Intent:** Define an immutable, verifiable GitHub release contract for the already certified `@bke/licensing 0.10.0` tarball **without authorizing or performing publication**.

**Entry proof (read-only and completed):** Libraries `main=eca60f7dd596cddb495f4de1d940d95ed00730d6`; release-readiness run [#43161808355](https://github.com/jan2xo/bke-libraries-typescript/actions/runs/43161808355) succeeded on that exact main. Original package run [#43153573142](https://github.com/jan2xo/bke-libraries-typescript/actions/runs/43153573142) produced unexpired artifact `13914662751` for PR #94 head `d6b0159d9c22e0f9e468040777ea4591953c89f6`, tarball SHA-256 `4d2f8e4295effcfd4aa3b6492944e8dbba3ec75e86c83727a30daa74e4f75d60`. Exact published tag `licensing-v0.10.0` does not exist at this checkpoint. Final readiness artifact `13918276768` contains `READ_ONLY_ELIGIBILITY_PROOF_NOT_A_RELEASE` and expires on 2026-12-12 UTC.

## Boundary

- Only **source code, pure release-plan verification, deterministic offline tests and documentation** are included in this wave. No workflow with `contents: write` is introduced, no `git push`, GitHub tag, release, npm publish, product catalog or production action is authorized.
- The read-only readiness evidence does **not** constitute signing authority, a GitHub release, an installed product certification, or TPM attestation.
- The eventual publication requires a **separate explicit user authorization** specifying `licensing-v0.10.0`, new verification of live `main` and artifact availability, a separate narrow protected publication execution, and an immutable public proof of the exact uploaded assets.

## Contract for a future separately authorized publisher

1. **Source of authority:** GitHub owner-approved release intent, on an exact permitted main SHA; not a feature PR event, periodic CI, or a successful package test alone. Fail closed unless original producer and readiness runs are successful `workflow_dispatch` runs in the same repository and at the exact pinned SHAs. Actor / permission / protected-environment approval must be verified by the eventual publisher.
2. **Original binary provenance:** Download only original archive `bke-licensing-certified-package` from successful run `43153573142`, never synthesize different bits at publication time; verify exact historical merged PR head, package tree and SHA-256.
3. **Readiness:** Verify run `43161808355` and nonexpired `bke-licensing-read-only-release-readiness` artifact, compare actual machine-readable JSON against pinned producer, version, tarball digest, main SHA and package subtree. Reinspect remote main at authorization and publication time; fail if moved. Never reinterpret a success log as evidence without validating the archive.
   **After this source-only PR merges, main will have a new SHA. The earlier #43161808355 readiness evidence remains valid historical proof but is stale for future exact-main publication. Rerun the read-only readiness workflow against the new exact main before any authorized release.**
4. **Collision and immutability:** Refuse any existing `refs/tags/licensing-v0.10.0` **or** GitHub Release. Never rewrite or delete a tag. New tag creation must target the pinned SHA atomically; if another actor wins the ref race, stop. Never attach to an existing mutable/unverified tag.
5. **Staged publication safety:** A future authorized publisher should create the tag **only after all read-only checks**, create a draft release tied to that tag, upload original `.tgz`, matching `.tgz.sha256`, original package provenance and the readiness evidence. Independently retrieve/check asset digests before transitioning the draft to published. Partial failure leaves the tag/draft for explicit incident recovery, not automatic destructive cleanup/retry.
6. **Post-publication proof:** Verify remote tag target and release target, asset list, exact SHA-256, release URL and immutable provenance. The *GitHub release* is the software release authority; npm publication and consumer repinning are independent intents, not implied.
7. **Security boundary:** No DS JWS signing key provisioning, database mutation, deployment, Agent installed E2E, Launcher update or PayMongo/Resend activity in this wave.

## Minimum complete certification graph

- **Required:** cheap exact-head Library Intentional CI Policy Guard plus offline tests of the fail-closed publication-plan comparator. This is policy/source-only work and does not change packed package bytes.
- **Not required:** new package build, licensing source/PG suite, unrelated library module suites, DS, Agent, Launcher, installers or release publishing.
- **Cross-repo proof:** none newly invoked; preserved original package SHA, licensing producer run and immutable readiness run are pinned external evidence.

**State until explicit authorization:** `PUBLICATION_NOT_AUTHORIZED`.
