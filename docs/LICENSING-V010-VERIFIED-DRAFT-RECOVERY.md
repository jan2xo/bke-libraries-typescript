# BKE Licensing 0.10.0 — fail-closed staged-draft recovery (owner-approved release)

**Intent:** Resume the same previously owner-authorized `licensing-v0.10.0` GitHub release after the original intentional workflow safely stopped at draft-asset verification. Do **not** create a second tag or draft, re-upload/overwrite assets, or rerun the initial publication workflow blindly.

## Durable incident identity

- Original owner command: [issue #100 comment #6816626228](https://github.com/jan2xo/bke-libraries-typescript/issues/100#issuecomment-6816626228), GitHub owner `jan2xo`, for exact main `b39fa5cc28c94c87a40a420e80f387c176564144`, readiness run `43168709538`.
- [ChatOps dispatch #43169339999](https://github.com/jan2xo/bke-libraries-typescript/actions/runs/43169339999): **SUCCESS**.
- [Original publisher run #43169356241](https://github.com/jan2xo/bke-libraries-typescript/actions/runs/43169356241): **FAIL**, but the preflight, original archive/provenance, tag/draft creation, and all four asset uploads were **SUCCESS**. The later `gh release download` returned HTTP 404 because a draft release isn't visible to that tag-based download path. Publish step **SKIPPED**.
- Existing tag `licensing-v0.10.0` points to **`b39fa5cc28c94c87a40a420e80f387c176564144`**.
- Existing draft release ID **`442576730`**, target same original approved SHA, four assets: `bke-licensing-0.10.0.tgz`, `.sha256`, `licensing-package-provenance.json`, `licensing-release-readiness.json`.
- Original tarball GitHub-reported digest **`sha256:4d2f8e4295effcfd4aa3b6492944e8dbba3ec75e86c83727a30daa74e4f75d60`** matches the original certified producer artifact from successful run `43153573142`.
- All four original asset digests and sizes were surfaced by live GitHub REST before coding recovery; **draft not published**.

## Narrow recovery invariants

1. This recovery workflow is a **new, separate, explicitly dispatched owner-command intent**: `/bke recover licensing-v0.10.0 sha=<CURRENT_MAIN_SHA> immutable=confirmed` on allowlisted issue #100. It is not triggered on pushes or PRs; the existing ChatOps router authenticates comment author ID, exact current main and freshness, then only dispatches this exact one-time recovery workflow.
2. The recovery workflow independently re-fetches the real owner authorization comment. It only accepts the GitHub Actions bot delegated from the owner command; no permission from comment text alone. It is hardcoded to **one** original failed publication run ID, draft release ID, tag, old approved release SHA, producer and readiness run IDs.
3. It must authenticate original workflow run ownership, exact source SHA, conclusion failure and **step sequence** (all preflight+stage PASS, draft-asset step FAIL, publish step SKIPPED). Fail on any otherwise-shaped partial run or unknown changes.
4. It must verify current workflow source `main` against the exact dispatch SHA; verify the existing immutable tag points to the originally authorized old main; verify current `@bke/licensing` Git subtree is identical to the certified one. Do not move/reforce the tag to the newer source-only recovery merge SHA.
5. It must verify original historical CI package and exact old-main readiness, retrieve their original artifacts, compute SHA256 for each of the four original asset bytes, and verify **exactly four** existing draft assets' GitHub-computed SHA-256 digests, sizes, IDs, and names; GitHub uploaded asset state must be `uploaded`. No duplicate, extra, missing, altered, or unverified draft assets.
6. **Only then** may a single authenticated GitHub API `PATCH /releases/442576730` set `draft=false`. Verify final tag SHA, version, published status `immutable:true`, asset count/IDs/digests/bytes and release URL independently. If any state deviates, STOP and checkpoint; never delete, overwrite, republish, force push or retry a partial mutation automatically.
7. The owner already confirmed enabling native GitHub release immutability. The workflow must require a matching explicit command and still check `immutable:true` as a postcondition.
8. No npm publication, product/installer/catalog, production DB/signing/deployment, PayMongo/Resend or unrelated CI.

## Minimum complete certification graph

- **Required source:** exact-head cheap Library Intentional CI Policy Guard with new deterministic recovery-command/owner-delegation negative tests and static workflow authority checks, no missing review threads; SHA-locked merge with read-back.
- **Required runtime:** one owner-command dispatch to the recovery workflow, GitHub run SUCCESS on the exact new main and independent final Release/tag/assets read-back. No new original package build, new readiness on a different main, or wider dependency CI: recovery is about exact original old-main staged bits, and the package source tree is unchanged.
- **Not required:** licensing runtime/PG, other library modules, DS/Agent/Launcher, installers/VM, production.

**Status:** source-only recovery design. Existing tag/draft intentionally left untouched until explicit verified recovery.
