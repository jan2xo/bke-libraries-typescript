import { createHash } from "node:crypto";

const REPO = "jan2xo/bke-libraries-typescript";
const TAG = "licensing-v0.10.0";
const VERSION = "0.10.0";
const OLD_MAIN = "b39fa5cc28c94c87a40a420e80f387c176564144";
const CERTIFIED_SOURCE = "d6b0159d9c22e0f9e468040777ea4591953c89f6";
const PACKAGE_TREE = "ca105493952d947e199958d0c214d0528c7ee51b";
const TARBALL_HASH = "4d2f8e4295effcfd4aa3b6492944e8dbba3ec75e86c83727a30daa74e4f75d60";
const FILES = Object.freeze([
  ["bke-licensing-0.10.0.tgz", 738370624],
  ["bke-licensing-0.10.0.tgz.sha256", 738370625],
  ["licensing-package-provenance.json", 738370620],
  ["licensing-release-readiness.json", 738370623],
]);
const STEPS = Object.freeze({
  "Require owner, manual main, exact SHA, original source tree and fixed package version": "success",
  "Authenticate original source PR, both exact successful runs and nonexpired artifacts": "success",
  "Download immutable original certified archive, not a reconstructed package": "success",
  "Download fresh exact-main read-only release-readiness evidence": "success",
  "Compare exact original bytes, checksums, provenance and readiness evidence": "success",
  "Stage new immutable tag and draft release with original verified assets only": "success",
  "Download actual GitHub draft assets and verify exact byte identity before publishing": "failure",
  "Publish verified draft and validate final GitHub release authority": "skipped",
});
function check(condition, code) {
  if (!condition) throw new Error("LICENSING_DRAFT_RECOVERY_" + code);
}
function validRun(run, id, head, path, conclusion) {
  return run && run.id === id && run.repository === REPO &&
    run.headSha === head && run.path === path &&
    run.event === "workflow_dispatch" && run.status === "completed" &&
    run.conclusion === conclusion;
}
function validArtifact(a, name, runId) {
  return a && Number.isSafeInteger(a.id) && a.id > 0 &&
    a.name === name && a.runId === runId && a.expired === false &&
    Number.isSafeInteger(a.size) && a.size > 0;
}
function shaBytes(bytes) {
  check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length < 200_000_000,
    "ARCHIVE_BYTES_INVALID");
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Pure one-time incident comparator; absolutely no GitHub write/network API.
 * The caller must independently obtain GitHub API state and original producer
 * + readiness artifact bytes. This proof alone cannot publish a draft.
 */
export function verifyStagedLicensingDraftRecovery(p) {
  check(p && p.github && p.runs && p.files && p.provenance && p.readiness,
    "INPUT_INVALID");
  check(/^[0-9a-f]{40}$/.test(p.expectedMainSha) &&
    p.github.mainSha === p.expectedMainSha &&
    p.github.repository === REPO,
  "CURRENT_MAIN_MOVED");
  check(p.github.currentPackageTree === PACKAGE_TREE &&
    p.github.tagRef === "refs/tags/" + TAG &&
    p.github.tagType === "commit" &&
    p.github.tagSha === OLD_MAIN,
  "TAG_OR_SOURCE_CHANGED");
  check(validRun(p.runs.original, 43153573142, CERTIFIED_SOURCE,
    ".github/workflows/licensing-package.yml", "success") &&
    validRun(p.runs.readiness, 43168709538, OLD_MAIN,
      ".github/workflows/licensing-release-readiness.yml", "success") &&
    validRun(p.runs.stage, 43169356241, OLD_MAIN,
      ".github/workflows/licensing-release-publication.yml", "failure"),
  "ORIGINAL_RUNS_INVALID");
  check(validArtifact(p.runs.originalArtifact, "bke-licensing-certified-package", 43153573142) &&
    validArtifact(p.runs.readinessArtifact, "bke-licensing-read-only-release-readiness", 43168709538),
  "ORIGINAL_ARTIFACT_INVALID");

  const steps = p.runs.stageSteps;
  check(Array.isArray(steps) && steps.length > 0 &&
    Object.entries(STEPS).every(([name, conclusion]) =>
      steps.filter(step => step.name === name && step.conclusion === conclusion).length === 1),
  "STAGING_STEPS_NOT_PROVEN");

  const draft = p.github.draft;
  check(draft && draft.id === 442576730 &&
    draft.tag_name === TAG && draft.target_commitish === OLD_MAIN &&
    draft.draft === true && draft.published_at === null &&
    draft.assets?.length === FILES.length && draft.immutable !== true,
  "NOT_ORIGINAL_UNPUBLISHED_DRAFT");

  check(p.provenance.schemaVersion === 1 &&
    p.provenance.component === "@bke/licensing" &&
    p.provenance.version === VERSION &&
    p.provenance.sourceSha === CERTIFIED_SOURCE &&
    p.provenance.tarballSha256 === TARBALL_HASH &&
    p.provenance.state === "CERTIFIED_UNPUBLISHED_CANDIDATE",
  "PRODUCER_PROVENANCE_INVALID");
  check(p.readiness.schemaVersion === 1 &&
    p.readiness.component === "@bke/licensing" &&
    p.readiness.version === VERSION &&
    p.readiness.certifiedSourceSha === CERTIFIED_SOURCE &&
    p.readiness.certifiedPackageTreeSha === PACKAGE_TREE &&
    p.readiness.verifiedCurrentMainSha === OLD_MAIN &&
    p.readiness.verifiedCurrentPackageTreeSha === PACKAGE_TREE &&
    p.readiness.certifiedRunId === 43153573142 &&
    p.readiness.state === "READ_ONLY_ELIGIBILITY_PROOF_NOT_A_RELEASE" &&
    p.readiness.tarballSha256 === TARBALL_HASH,
  "READINESS_EVIDENCE_INVALID");

  const names = Object.keys(p.files).sort();
  check(names.join("|") === FILES.map(x => x[0]).sort().join("|"),
    "ORIGINAL_ASSET_SET_INVALID");
  const hashes = {};
  for (const [name, id] of FILES) {
    const asset = draft.assets.find(a => a.name === name);
    check(asset && asset.id === id && asset.state === "uploaded" &&
      asset.size === p.files[name].length &&
      asset.digest === "sha256:" + shaBytes(p.files[name]),
    "GITHUB_ASSET_MISMATCH_" + name);
    hashes[name] = asset.digest;
  }
  check(shaBytes(p.files["bke-licensing-0.10.0.tgz"]) === TARBALL_HASH,
    "ORIGINAL_TARBALL_HASH_INVALID");
  check(p.files["bke-licensing-0.10.0.tgz.sha256"].toString("utf8").trimEnd() ===
    TARBALL_HASH + "  artifacts/bke-licensing-0.10.0.tgz",
  "ORIGINAL_CHECKSUM_INVALID");

  return Object.freeze({
    schemaVersion: 1, repository: REPO, tag: TAG, originalTargetSha: OLD_MAIN,
    currentMainSha: p.expectedMainSha, draftReleaseId: 442576730,
    originalPublicationRunId: 43169356241,
    sha256: TARBALL_HASH,
    assets: Object.freeze(hashes),
    state: "EXISTING_DRAFT_VERIFIED_READY_TO_PUBLISH_ONCE",
  });
}
