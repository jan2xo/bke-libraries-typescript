import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const REPOSITORY = "jan2xo/bke-libraries-typescript";
const PRODUCER_WORKFLOW = ".github/workflows/licensing-package.yml";
const READINESS_WORKFLOW = ".github/workflows/licensing-release-readiness.yml";
const EXPECTED_ORIGINAL_ARTIFACT = "bke-licensing-certified-package";
const EXPECTED_READINESS_ARTIFACT = "bke-licensing-read-only-release-readiness";

function requireThat(condition, code) {
  if (!condition) throw new Error("LICENSING_PUBLICATION_PLAN_" + code);
}
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function sha(value) {
  return typeof value === "string" && SHA.test(value);
}
function hash(value) {
  return typeof value === "string" && HASH.test(value);
}
function positiveId(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function identicalKeys(value, keys) {
  return object(value) && Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}

/**
 * Constructs a NON-AUTHORIZING release plan from authenticated GitHub state
 * and exact downloaded historical artifacts. This function performs no I/O.
 *
 * The future release executor must independently authenticate REST responses,
 * verified artifact bytes, tag/ref immutability, approvals and permissions;
 * caller-supplied JSON is never itself an authority to publish.
 */
export function verifyLicensingPublicationPlan(input) {
  requireThat(object(input), "INPUT_INVALID");
  const { request, github, readinessEvidence, originalProvenance, tarball } = input;
  requireThat(object(request) && object(github) && object(tarball), "INPUT_INVALID");
  const { repository, version, expectedMainSha, certifiedSourceSha,
    expectedTarballSha256, producerRunId, readinessRunId } = request;

  requireThat(repository === REPOSITORY && github.repository === REPOSITORY,
    "REPOSITORY_MISMATCH");
  requireThat(typeof version === "string" && VERSION.test(version),
    "VERSION_INVALID");
  const tag = "licensing-v" + version;
  const filename = "bke-licensing-" + version + ".tgz";
  requireThat(sha(expectedMainSha) && sha(certifiedSourceSha) &&
    sha(github.mainSha), "SHA_INVALID");
  requireThat(expectedMainSha === github.mainSha, "STALE_MAIN");
  requireThat(hash(expectedTarballSha256), "HASH_INVALID");
  requireThat(positiveId(producerRunId) && positiveId(readinessRunId) &&
    producerRunId !== readinessRunId, "RUN_ID_INVALID");
  requireThat(github.tagExists === false && github.releaseExists === false,
    "TAG_OR_RELEASE_COLLISION");

  const { producerRun, readinessRun, producerPr, originalArtifact, readinessArtifact } = github;
  requireThat(object(producerPr) && producerPr.merged === true &&
    producerPr.baseRef === "main" &&
    producerPr.headRepository === REPOSITORY &&
    producerPr.headSha === certifiedSourceSha, "UNTRUSTED_PRODUCER_PR");
  for (const [run, id, path, head] of [
    [producerRun, producerRunId, PRODUCER_WORKFLOW, certifiedSourceSha],
    [readinessRun, readinessRunId, READINESS_WORKFLOW, expectedMainSha],
  ]) {
    requireThat(object(run) && run.repository === REPOSITORY &&
      run.id === id && run.path === path && run.headSha === head &&
      run.event === "workflow_dispatch" &&
      run.status === "completed" && run.conclusion === "success",
    "UNTRUSTED_WORKFLOW_RUN");
  }
  for (const [artifact, name, id] of [
    [originalArtifact, EXPECTED_ORIGINAL_ARTIFACT, producerRunId],
    [readinessArtifact, EXPECTED_READINESS_ARTIFACT, readinessRunId],
  ]) {
    requireThat(object(artifact) && positiveId(artifact.id) &&
      artifact.name === name && artifact.runId === id &&
      artifact.expired === false && Number.isSafeInteger(artifact.size) &&
      artifact.size > 0, "UNTRUSTED_WORKFLOW_ARTIFACT");
  }

  const evidenceKeys = [
    "schemaVersion", "component", "version", "certifiedRunId",
    "certifiedSourceSha", "certifiedSourceTreeSha", "certifiedPackageTreeSha",
    "verifiedCurrentMainSha", "verifiedCurrentPackageTreeSha",
    "tarballFilename", "tarballSha256", "state",
  ];
  requireThat(identicalKeys(readinessEvidence, evidenceKeys) &&
    readinessEvidence.schemaVersion === 1 &&
    readinessEvidence.component === "@bke/licensing" &&
    readinessEvidence.state === "READ_ONLY_ELIGIBILITY_PROOF_NOT_A_RELEASE" &&
    readinessEvidence.version === version &&
    readinessEvidence.certifiedRunId === producerRunId &&
    readinessEvidence.certifiedSourceSha === certifiedSourceSha &&
    sha(readinessEvidence.certifiedSourceTreeSha) &&
    sha(readinessEvidence.certifiedPackageTreeSha) &&
    readinessEvidence.certifiedPackageTreeSha === readinessEvidence.verifiedCurrentPackageTreeSha &&
    readinessEvidence.verifiedCurrentMainSha === expectedMainSha &&
    readinessEvidence.tarballFilename === filename &&
    readinessEvidence.tarballSha256 === expectedTarballSha256,
  "READINESS_EVIDENCE_MISMATCH");

  const provenanceKeys = [
    "schemaVersion", "component", "version", "sourceSha", "sourceTreeSha",
    "tarballFilename", "tarballSha256", "state",
  ];
  requireThat(identicalKeys(originalProvenance, provenanceKeys) &&
    originalProvenance.schemaVersion === 1 &&
    originalProvenance.component === "@bke/licensing" &&
    originalProvenance.state === "CERTIFIED_UNPUBLISHED_CANDIDATE" &&
    originalProvenance.version === version &&
    originalProvenance.sourceSha === certifiedSourceSha &&
    originalProvenance.sourceTreeSha === readinessEvidence.certifiedSourceTreeSha &&
    originalProvenance.tarballFilename === filename &&
    originalProvenance.tarballSha256 === expectedTarballSha256,
  "ORIGINAL_PROVENANCE_MISMATCH");

  // The caller must hash the original archive bytes separately. Comparing
  // only two manifests would not prove the released bytes are authentic.
  requireThat(tarball.filename === filename &&
    tarball.actualSha256 === expectedTarballSha256 &&
    tarball.checksumFileVerified === true &&
    tarball.packedName === "@bke/licensing" &&
    tarball.packedVersion === version, "ORIGINAL_ARCHIVE_MISMATCH");

  return Object.freeze({
    schemaVersion: 1,
    repository: REPOSITORY,
    component: "@bke/licensing",
    version,
    tag,
    targetSha: expectedMainSha,
    producerRunId,
    producerSourceSha: certifiedSourceSha,
    readinessRunId,
    originalArtifactId: originalArtifact.id,
    readinessArtifactId: readinessArtifact.id,
    packageTreeSha: readinessEvidence.certifiedPackageTreeSha,
    tarballFilename: filename,
    tarballSha256: expectedTarballSha256,
    // An authorized publisher must include the original archive, checksum,
    // original provenance and verified readiness evidence, not a new npm pack.
    requiredReleaseAssets: Object.freeze([
      filename, filename + ".sha256",
      "licensing-package-provenance.json", "licensing-release-readiness.json",
    ]),
    state: "PUBLICATION_NOT_AUTHORIZED",
  });
}

// No executable release path, POST request, credential access, tag, or publish.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error("PUBLICATION_NOT_AUTHORIZED: source-only comparator; no CLI release operation");
  process.exitCode = 1;
}
