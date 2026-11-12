# BKE libraries — intentional CI migration

**Scope:** Active BKE TypeScript library module certification and package build workflows. PRs are durable ledgers; expensive module/PG/package/release jobs must not run because a PR opened, a lockfile changed or main was pushed.

**Source baseline:** `782ccbec267db7f142606752b62e9ad7435d7026`. Existing package/source application code is unchanged.

## Certification intent

Remove implicit `pull_request` and `push` triggers from heavy module workflows; preserve each workflow's explicit `workflow_dispatch` interface. Keep lightweight PR guard and trusted package router events. Remove stale experimental identity extraction push trigger; do not dispatch its branch-writing step without explicit instruction.

Install one lightweight, security-focused `library-intent-policy-guard` PR check to assert that:
- active heavyweight module workflows are explicit only;
- publish-capable module workflows have no implicit triggers;
- each remains dispatchable and keeps a stable workflow name/job;
- trusted owner-only certification routing remains preserved;
- no production/package release/tag created by this migration.

**Required graph:** cheap new policy guard on exact branch HEAD, optional explicit policy-only dispatch if branch check cannot evaluate. No heavy source, database, packages, payments, releases or installers: this is trigger-governance, not library implementation. If required branch-protection checks disallow merge, fail closed rather than weakening controls.

**Potential external limitation:** branch-protection API access is unavailable to the connector. Verify actual mergeability and required checks before any SHA-locked merge.

**Publication/production locked:** no `gh release` commands executed, no repo secret/key use, no production mutation, no package tag, no payment/email provider traffic.
