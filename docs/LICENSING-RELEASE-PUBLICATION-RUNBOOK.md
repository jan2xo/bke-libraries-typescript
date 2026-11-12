# BKE Licensing v0.10.0 GitHub release — authorized, exact-head, owner-only

## BKE CERTIFICATION PLAN — Licensing 0.10.0 immutable GitHub publication (owner-authorized, fail-closed)

**Publication authorization:** User explicitly agreed to the narrowly discussed GitHub `licensing-v0.10.0` release after exact-head certification. Scope excludes npm, Digital Solutions/Agent/Launcher deployment, production signing, and catalog activation.

**Base:** `25c91abb21ccf777574a1f4bd48506fd0bdfa6c0`. **Current candidate HEAD:** recorded after source writes; older green head is stale.

**Required source certification graph:** existing cheap `library-intent-policy-guard` extended to validate owner-only manual publication workflow, exact-tag confirmation, no PR/push/release event triggers, restricted exception to contents:write, original and readiness provenance authentication, unchanged package subtree, separate staged publication assets and post-upload verification; deterministic offline comparator tests. If publication code/permissions materially affect other shared behaviors, widen narrowly. The required final graph must PASS on exact PR head before SHA-locked merge.

**Not required:** rebuild/publish npm package, run other library module suites, DS/Agent/Launcher CI, installer/UTM, production. Historical original package proof `43153573142` at `d6b0159d9c22e0f9e468040777ea4591953c89f6` remains immutable; tarball SHA-256 `4d2f8e4295effcfd4aa3b6492944e8dbba3ec75e86c83727a30daa74e4f75d60`.

**Release dispatch dependency:** source PR merge changes `main`. Before actual publication, dispatch `licensing-release-readiness.yml` explicitly on the new exact main, verify SUCCESS and final artifact. Owner then explicitly dispatches release workflow on that same main, supplying that run ID. Workflow itself independently reauthenticates runs, artifact identities and original tarball bytes. A green old-main readiness run is NOT sufficient.

**Mutation boundary:** Only owner-invoked exact `licensing-v0.10.0` GitHub tag and GitHub Release with four verified original assets are authorized. Mutation occurs in explicit workflow only after all fail-closed checks. Never automatically retry/mutate an existing tag or release. No npm publishing or production cutover.

**Current state:** draft execution ledger; no GitHub release/tag exists, no dispatch has occurred.

After source merge, the user must dispatch read-only readiness on **new main** and verify the run completed SUCCESS, then dispatch the explicit release workflow with that run ID. Do not reuse readiness run 43161808355 (old main). Partial failures after creating a tag or draft intentionally leave them intact for deliberate incident recovery; do not re-run publication blindly or delete/reforce an immutable tag. Full verification checks exact uploaded original `.tgz`, `.sha256`, producer provenance and new readiness JSON, then changes draft to published. Production remains locked.

## Mandatory platform immutability before publication

GitHub release asset/tag immutability is a **separate repository setting** and is not implied by exact-SHA CI or a no-clobber workflow. The repository owner must first check `GET /repos/jan2xo/bke-libraries-typescript/immutable-releases` using an admin-read authenticated `gh` token and require `enabled: true`; GitHub returns 404 if disabled. If disabled, the owner must enable immutable releases under **Repository Settings → General → Releases → Enable release immutability** *before* dispatching. This broadens repository-level release protection for all future releases; it does not retroactively change older releases. The manual publisher requires the exact `confirm_immutable_releases=GITHUB_IMMUTABLE_RELEASES_ENABLED` owner assertion and fails its final postcondition unless the published GitHub release has `immutable: true`. Do not run publication directly without the owner's admin-read setting check. A failed final immutability check after release creation is an incident, not license to force-republish or reuse the tag.
