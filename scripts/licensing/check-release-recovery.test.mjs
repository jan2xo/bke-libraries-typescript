import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { verifyStagedLicensingDraftRecovery } from "./check-release-recovery.mjs";

const REPO = "jan2xo/bke-libraries-typescript";
const OLD_SHA = "b39fa5cc28c94c87a40a420e80f387c176564144";
const SOURCE = "d6b0159d9c22e0f9e468040777ea4591953c89f6";
const TREE = "ca105493952d947e199958d0c214d0528c7ee51b";
const HASH = "4d2f8e4295effcfd4aa3b6492944e8dbba3ec75e86c83727a30daa74e4f75d60";
const CURRENT_SHA = "a".repeat(40);
const assetIds = {
  "bke-licensing-0.10.0.tgz": 738370624,
  "bke-licensing-0.10.0.tgz.sha256": 738370625,
  "licensing-package-provenance.json": 738370620,
  "licensing-release-readiness.json": 738370623,
};
const stageSteps = {
  "Require owner, manual main, exact SHA, original source tree and fixed package version": "success",
  "Authenticate original source PR, both exact successful runs and nonexpired artifacts": "success",
  "Download immutable original certified archive, not a reconstructed package": "success",
  "Download fresh exact-main read-only release-readiness evidence": "success",
  "Compare exact original bytes, checksums, provenance and readiness evidence": "success",
  "Stage new immutable tag and draft release with original verified assets only": "success",
  "Download actual GitHub draft assets and verify exact byte identity before publishing": "failure",
  "Publish verified draft and validate final GitHub release authority": "skipped",
};
function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}
function run(id, headSha, path, conclusion) {
  return { id, repository: REPO, headSha, path,
    status: "completed", conclusion, event: "workflow_dispatch" };
}
function fixture() {
  const files = {
    "bke-licensing-0.10.0.tgz": Buffer.from("SYNTHETIC_ONLY"),
    "bke-licensing-0.10.0.tgz.sha256": Buffer.from(HASH +
      "  artifacts/bke-licensing-0.10.0.tgz\n"),
    "licensing-package-provenance.json": Buffer.from("{}"),
    "licensing-release-readiness.json": Buffer.from("{}"),
  };
  return {
    expectedMainSha: CURRENT_SHA,
    github: {
      repository: REPO, mainSha: CURRENT_SHA, currentPackageTree: TREE,
      tagRef: "refs/tags/licensing-v0.10.0", tagType: "commit", tagSha: OLD_SHA,
      draft: {
        id: 442576730, tag_name: "licensing-v0.10.0",
        target_commitish: OLD_SHA, draft: true, immutable: false, published_at: null,
        assets: Object.entries(files).map(([name, data]) => ({
          name, id: assetIds[name], state: "uploaded",
          size: data.length, digest: "sha256:" + sha(data),
        })),
      },
    },
    runs: {
      original: run(43153573142, SOURCE, ".github/workflows/licensing-package.yml", "success"),
      readiness: run(43168709538, OLD_SHA,
        ".github/workflows/licensing-release-readiness.yml", "success"),
      stage: run(43169356241, OLD_SHA,
        ".github/workflows/licensing-release-publication.yml", "failure"),
      originalArtifact: { id: 13914662751, name: "bke-licensing-certified-package",
        runId: 43153573142, expired: false, size: 31331 },
      readinessArtifact: { id: 13920938267, name: "bke-licensing-read-only-release-readiness",
        runId: 43168709538, expired: false, size: 560 },
      stageSteps: Object.entries(stageSteps).map(([name, conclusion]) => ({ name, conclusion })),
    },
    files,
    provenance: {
      schemaVersion: 1, component: "@bke/licensing",
      version: "0.10.0", sourceSha: SOURCE,
      tarballSha256: HASH, state: "CERTIFIED_UNPUBLISHED_CANDIDATE",
    },
    readiness: {
      schemaVersion: 1, component: "@bke/licensing", version: "0.10.0",
      certifiedSourceSha: SOURCE, certifiedPackageTreeSha: TREE,
      verifiedCurrentMainSha: OLD_SHA, verifiedCurrentPackageTreeSha: TREE,
      certifiedRunId: 43153573142,
      state: "READ_ONLY_ELIGIBILITY_PROOF_NOT_A_RELEASE",
      tarballSha256: HASH,
    },
  };
}
function reject(mutator, code) {
  const p = fixture(); mutator(p);
  assert.throws(() => verifyStagedLicensingDraftRecovery(p),
    { message: "LICENSING_DRAFT_RECOVERY_" + code });
}
describe("staged immutable v0.10.0 release recovery incident", () => {
  it("synthetic bytes NEVER pass a certified real tarball SHA-256", () => {
    reject(() => {}, "ORIGINAL_TARBALL_HASH_INVALID");
  });
  it("rejects moved main or package-source drift", () => {
    reject(p => { p.github.mainSha = "b".repeat(40); }, "CURRENT_MAIN_MOVED");
    reject(p => { p.github.currentPackageTree = "b".repeat(40); }, "TAG_OR_SOURCE_CHANGED");
  });
  it("rejects tag swaps, annotated tag change or unauthorized target", () => {
    reject(p => { p.github.tagSha = "b".repeat(40); }, "TAG_OR_SOURCE_CHANGED");
    reject(p => { p.github.tagType = "tag"; }, "TAG_OR_SOURCE_CHANGED");
  });
  it("requires exact failed staging run, successful producer and old readiness", () => {
    reject(p => { p.runs.stage.conclusion = "success"; }, "ORIGINAL_RUNS_INVALID");
    reject(p => { p.runs.readiness.headSha = CURRENT_SHA; }, "ORIGINAL_RUNS_INVALID");
    reject(p => { p.runs.original.event = "push"; }, "ORIGINAL_RUNS_INVALID");
  });
  it("rejects incorrect stage steps and premature publication", () => {
    reject(p => { p.runs.stageSteps[5].conclusion = "failure"; }, "STAGING_STEPS_NOT_PROVEN");
    reject(p => { p.runs.stageSteps.pop(); }, "STAGING_STEPS_NOT_PROVEN");
    reject(p => { p.runs.stageSteps[7].conclusion = "success"; }, "STAGING_STEPS_NOT_PROVEN");
  });
  it("rejects expired, missing or forged historical artifacts", () => {
    reject(p => { p.runs.originalArtifact.expired = true; }, "ORIGINAL_ARTIFACT_INVALID");
    reject(p => { p.runs.readinessArtifact.runId = 8; }, "ORIGINAL_ARTIFACT_INVALID");
  });
  it("rejects already published releases and altered draft IDs", () => {
    reject(p => { p.github.draft.draft = false; }, "NOT_ORIGINAL_UNPUBLISHED_DRAFT");
    reject(p => { p.github.draft.id = 1; }, "NOT_ORIGINAL_UNPUBLISHED_DRAFT");
    reject(p => { p.github.draft.immutable = true; }, "NOT_ORIGINAL_UNPUBLISHED_DRAFT");
    reject(p => { p.github.draft.published_at = "2026-01-01"; }, "NOT_ORIGINAL_UNPUBLISHED_DRAFT");
  });
  it("rejects extra or missing assets and rewritten stage files", () => {
    reject(p => { p.github.draft.assets.push({ ...p.github.draft.assets[0] }); },
      "NOT_ORIGINAL_UNPUBLISHED_DRAFT");
    reject(p => { p.github.draft.assets[0].id = 0; },
      "GITHUB_ASSET_MISMATCH_bke-licensing-0.10.0.tgz");
    reject(p => { p.github.draft.assets[0].digest = "sha256:" + "0".repeat(64); },
      "GITHUB_ASSET_MISMATCH_bke-licensing-0.10.0.tgz");
  });
  it("rejects original provenance, readiness, and checksum tampering", () => {
    reject(p => { p.provenance.state = "PUBLISHED"; }, "PRODUCER_PROVENANCE_INVALID");
    reject(p => { p.readiness.certifiedPackageTreeSha = CURRENT_SHA; }, "READINESS_EVIDENCE_INVALID");
    reject(p => { p.files["bke-licensing-0.10.0.tgz.sha256"] = Buffer.from("WRONG");
      p.github.draft.assets[1].size = p.files["bke-licensing-0.10.0.tgz.sha256"].length;
      p.github.draft.assets[1].digest = "sha256:" + sha(p.files["bke-licensing-0.10.0.tgz.sha256"]);
    }, "ORIGINAL_TARBALL_HASH_INVALID");
  });
});
