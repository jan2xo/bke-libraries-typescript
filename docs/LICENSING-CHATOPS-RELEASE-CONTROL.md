# BKE Licensing 0.10.0 — authenticated ChatOps workflow dispatch

**Owner:** GitHub source/release authority in TypeScript libraries. **Command ledger:** [issue #100](https://github.com/jan2xo/bke-libraries-typescript/issues/100). **Bootstrap evidence:** comment #6816324960 is authored by GitHub account `jan2xo` (numeric user ID 163499503), on issue ID 6344112785, and caused only a skipped existing router workflow: no certification or release.

## Intent
Restore explicit GitHub workflow dispatch through the connected ChatGPT GitHub issue-comment action. Keep PR/push CI cheap; substantial workflows remain `workflow_dispatch` only and run only after a validated owner command. Reuse the existing owner login GitHub identity (not a new token or secret).

## Version-specific commands, exact single line

- `/bke certify licensing-v0.10.0 sha=<40hex-main>` — only dispatch read-only `licensing-release-readiness.yml` with pinned historical inputs.
- `/bke publish licensing-v0.10.0 sha=<40hex-main> readiness=<successful-run-id> immutable=confirmed` — only dispatch the existing owner-authorized `licensing-release-publication.yml` after verifying successful **same-main** readiness and nonexpired evidence.

## Fail-closed identity and trust boundaries

1. A dedicated **issue_comment.created** cheap router filters exclusively issue #100, not arbitrary PRs or issues. Re-fetch and compare the exact GitHub-authored comment, ID, sender/user ID, `OWNER` association, issue number and numeric ID, repository and exact body. Reject edited/expired comments, malformed commands, stale main, other versions, extra input, unknown actors and unsupported workflows.
2. Router may receive `actions:write` to dispatch exact allowlisted existing workflows. It has **no** `contents:write` permission, arbitrary API, shell or production secrets. No heavyweight work starts on PR/push events.
3. Publisher retains independent exact-run/asset/tag/provenance proof and requires owner authorization. When dispatched by the GitHub Actions bot, it **independently re-fetches** the matching owner comment (pinned ID and exact message) and rejects comments older than a narrow validity window. The bot is not trusted merely because it can call workflow_dispatch.
4. Owner must have GitHub-native release immutability enabled before publication; `immutable=confirmed` is a **direct user assertion**, not a machine-verifiable substitute for the admin-read repository setting. The workflow must continue checking final `immutable:true`; no pre-existing tag/draft may be reused, overwritten or deleted.
5. Only GitHub `licensing-v0.10.0` assets are in the authorization. npm publication, BKE production, signing cutover, DS/Agent/Launcher/installer/catalog remain locked.

## Certification plan

**Required:** deterministic parser/authorization positive+negative tests; the cheap exact-head `library-intent-policy-guard`; an explicit **read-only owner-comment integration proof** after merge that dispatches `licensing-release-readiness.yml` at exact current main and returns SUCCESS+artifact. A publication command is separately authorized only if owner native immutable release setting is enabled. 

**Not required:** unrelated licensing package/PG/JS runtime, Payments/commerce, DS/Agent/Launcher/installer/VM; no packed library code is changed. Do not mark actual release published from source CI. Source-only merge will shift `main`, requiring a fresh exact-main readiness run before any release.
