import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { verifyLicensingPublicationPlan } from "./check-publication-plan.mjs";

const repo = "jan2xo/bke-libraries-typescript";
const main = "a".repeat(40);
const source = "b".repeat(40);
const sourceTree = "c".repeat(40);
const packageTree = "d".repeat(40);
const version = "0.10.0";
const checksum = createHash("sha256").update("ORIGINAL_ARCHIVE_BYTES").digest("hex");

function fixture() {
  const filename = "bke-licensing-" + version + ".tgz";
  return {
    request: {
      repository: repo,
      version,
      expectedMainSha: main,
      certifiedSourceSha: source,
      expectedTarballSha256: checksum,
      producerRunId: 43153573142,
      readinessRunId: 43161808355,
    },
    github: {
      repository: repo,
      mainSha: main,
      tagExists: false,
      releaseExists: false,
      producerRun: {
        id: 43153573142, repository: repo,
        path: ".github/workflows/licensing-package.yml",
        headSha: source, event: "workflow_dispatch",
        status: "completed", conclusion: "success",
      },
      readinessRun: {
        id: 43161808355, repository: repo,
        path: ".github/workflows/licensing-release-readiness.yml",
        headSha: main, event: "workflow_dispatch",
        status: "completed", conclusion: "success",
      },
      producerPr: {
        merged: true, baseRef: "main", headRepository: repo,
        headSha: source,
      },
      originalArtifact: {
        id: 13914662751, name: "bke-licensing-certified-package",
        runId: 43153573142, expired: false, size: 31331,
      },
      readinessArtifact: {
        id: 13918276768, name: "bke-licensing-read-only-release-readiness",
        runId: 43161808355, expired: false, size: 560,
      },
    },
    readinessEvidence: {
      schemaVersion: 1, component: "@bke/licensing", version,
      certifiedRunId: 43153573142,
      certifiedSourceSha: source,
      certifiedSourceTreeSha: sourceTree,
      certifiedPackageTreeSha: packageTree,
      verifiedCurrentMainSha: main,
      verifiedCurrentPackageTreeSha: packageTree,
      tarballFilename: filename, tarballSha256: checksum,
      state: "READ_ONLY_ELIGIBILITY_PROOF_NOT_A_RELEASE",
    },
    originalProvenance: {
      schemaVersion: 1, component: "@bke/licensing", version,
      sourceSha: source, sourceTreeSha: sourceTree,
      tarballFilename: filename, tarballSha256: checksum,
      state: "CERTIFIED_UNPUBLISHED_CANDIDATE",
    },
    tarball: {
      filename, actualSha256: checksum, checksumFileVerified: true,
      packedName: "@bke/licensing", packedVersion: version,
    },
  };
}
function reject(modify, code) {
  const input = fixture();
  modify(input);
  assert.throws(() => verifyLicensingPublicationPlan(input),
    { message: "LICENSING_PUBLICATION_PLAN_" + code });
}

describe("immutable licensing publication plan is never release authorization", () => {
  it("binds only original certified source, readiness proof and exact tarball", () => {
    const p = verifyLicensingPublicationPlan(fixture());
    assert.deepEqual(p, {
      schemaVersion: 1, repository: repo, component: "@bke/licensing", version,
      tag: "licensing-v0.10.0", targetSha: main,
      producerRunId: 43153573142, producerSourceSha: source,
      readinessRunId: 43161808355,
      originalArtifactId: 13914662751,
      readinessArtifactId: 13918276768,
      packageTreeSha: packageTree,
      tarballFilename: "bke-licensing-0.10.0.tgz",
      tarballSha256: checksum,
      requiredReleaseAssets: [
        "bke-licensing-0.10.0.tgz",
        "bke-licensing-0.10.0.tgz.sha256",
        "licensing-package-provenance.json",
        "licensing-release-readiness.json",
      ],
      state: "PUBLICATION_NOT_AUTHORIZED",
    });
    assert.equal(Object.isFrozen(p), true);
    assert.equal(Object.isFrozen(p.requiredReleaseAssets), true);
  });

  it("never provides a standalone release command", () => {
    assert.throws(() => execFileSync(process.execPath,
      ["scripts/licensing/check-publication-plan.mjs"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), /Command failed/);
  });

  it("rejects an unexpected repository or version substitution", () => {
    reject(i => { i.request.repository = "evil/other"; }, "REPOSITORY_MISMATCH");
    reject(i => { i.github.repository = "evil/other"; }, "REPOSITORY_MISMATCH");
    reject(i => { i.request.version = "0.10.0-beta"; }, "VERSION_INVALID");
    reject(i => { i.request.version = "00.10.0"; }, "VERSION_INVALID");
  });

  it("refuses a stale SHA, malformed SHA or hash", () => {
    reject(i => { i.github.mainSha = "e".repeat(40); }, "STALE_MAIN");
    reject(i => { i.request.expectedMainSha = "main"; }, "SHA_INVALID");
    reject(i => { i.request.expectedTarballSha256 = "bad"; }, "HASH_INVALID");
  });

  it("refuses an existing tag or a release without a tag", () => {
    reject(i => { i.github.tagExists = true; }, "TAG_OR_RELEASE_COLLISION");
    reject(i => { i.github.releaseExists = true; }, "TAG_OR_RELEASE_COLLISION");
  });

  it("rejects run ID swaps and invalid run references", () => {
    reject(i => { i.request.readinessRunId = i.request.producerRunId; }, "RUN_ID_INVALID");
    reject(i => { i.request.producerRunId = -1; }, "RUN_ID_INVALID");
    reject(i => { i.github.producerRun.id++; }, "UNTRUSTED_WORKFLOW_RUN");
  });

  it("requires a merged original internal main PR", () => {
    reject(i => { i.github.producerPr.merged = false; }, "UNTRUSTED_PRODUCER_PR");
    reject(i => { i.github.producerPr.headRepository = "fork/foreign"; }, "UNTRUSTED_PRODUCER_PR");
    reject(i => { i.github.producerPr.headSha = "f".repeat(40); }, "UNTRUSTED_PRODUCER_PR");
  });

  it("rejects forged or merely queued run results", () => {
    reject(i => { i.github.producerRun.conclusion = "failure"; }, "UNTRUSTED_WORKFLOW_RUN");
    reject(i => { i.github.producerRun.event = "push"; }, "UNTRUSTED_WORKFLOW_RUN");
    reject(i => { i.github.readinessRun.status = "in_progress"; }, "UNTRUSTED_WORKFLOW_RUN");
    reject(i => { i.github.readinessRun.headSha = source; }, "UNTRUSTED_WORKFLOW_RUN");
    reject(i => { i.github.readinessRun.path = ".github/workflows/evil.yml"; }, "UNTRUSTED_WORKFLOW_RUN");
  });

  it("rejects missing, expired, foreign and zero-byte artifacts", () => {
    reject(i => { i.github.originalArtifact.expired = true; }, "UNTRUSTED_WORKFLOW_ARTIFACT");
    reject(i => { i.github.readinessArtifact.runId = 5; }, "UNTRUSTED_WORKFLOW_ARTIFACT");
    reject(i => { i.github.originalArtifact.size = 0; }, "UNTRUSTED_WORKFLOW_ARTIFACT");
    reject(i => { i.github.readinessArtifact.name = "other"; }, "UNTRUSTED_WORKFLOW_ARTIFACT");
  });

  it("requires the exact read-only evidence schema and marker", () => {
    reject(i => { i.readinessEvidence.state = "PUBLISHED"; }, "READINESS_EVIDENCE_MISMATCH");
    reject(i => { i.readinessEvidence.injected = "false"; }, "READINESS_EVIDENCE_MISMATCH");
    reject(i => { delete i.readinessEvidence.certifiedPackageTreeSha; }, "READINESS_EVIDENCE_MISMATCH");
    reject(i => { i.readinessEvidence.verifiedCurrentMainSha = source; }, "READINESS_EVIDENCE_MISMATCH");
  });

  it("detects package subtree drift even with stable archive hash", () => {
    reject(i => { i.readinessEvidence.verifiedCurrentPackageTreeSha = "f".repeat(40); },
      "READINESS_EVIDENCE_MISMATCH");
    reject(i => { i.readinessEvidence.certifiedSourceSha = main; }, "READINESS_EVIDENCE_MISMATCH");
  });

  it("rejects original provenance forgery or version changes", () => {
    reject(i => { i.originalProvenance.state = "PUBLISHED"; }, "ORIGINAL_PROVENANCE_MISMATCH");
    reject(i => { i.originalProvenance.sourceTreeSha = main; }, "ORIGINAL_PROVENANCE_MISMATCH");
    reject(i => { i.originalProvenance.version = "0.9.0"; }, "ORIGINAL_PROVENANCE_MISMATCH");
  });

  it("rejects unexpected archive bytes, checksum file and package metadata", () => {
    reject(i => { i.tarball.actualSha256 = "0".repeat(64); }, "ORIGINAL_ARCHIVE_MISMATCH");
    reject(i => { i.tarball.checksumFileVerified = false; }, "ORIGINAL_ARCHIVE_MISMATCH");
    reject(i => { i.tarball.packedName = "@bke/other"; }, "ORIGINAL_ARCHIVE_MISMATCH");
    reject(i => { i.tarball.packedVersion = "0.9.0"; }, "ORIGINAL_ARCHIVE_MISMATCH");
  });
});
