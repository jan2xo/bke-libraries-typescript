import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { verifyLicensingReleaseReadiness } from "./check-release-readiness.mjs";

const source = "a".repeat(40);
const sourceTree = "b".repeat(40);
const main = "c".repeat(40);
const packageTree = "d".repeat(40);
const version = "0.10.0";
const archive = Buffer.from("SYNTHETIC_ONLY_NOT_A_REAL_ARCHIVE", "utf8");
const hash = createHash("sha256").update(archive).digest("hex");
const filename = "bke-licensing-" + version + ".tgz";

function fixture() {
  return {
    manifest: {
      schemaVersion: 1,
      component: "@bke/licensing",
      version,
      sourceSha: source,
      sourceTreeSha: sourceTree,
      tarballFilename: filename,
      tarballSha256: hash,
      state: "CERTIFIED_UNPUBLISHED_CANDIDATE",
    },
    archiveBytes: Buffer.from(archive),
    sha256File: hash + "  artifacts/" + filename + "\n",
    packedPackageJson: { name: "@bke/licensing", version },
    expectedMainSha: main,
    actualMainSha: main,
    certifiedSourceSha: source,
    verifiedSourceTreeSha: sourceTree,
    certifiedPackageTreeSha: packageTree,
    currentPackageTreeSha: packageTree,
    expectedTarballSha256: hash,
    version,
    certifiedRunId: 43153573142,
  };
}
function reject(changes, code) {
  assert.throws(
    () => verifyLicensingReleaseReadiness({ ...fixture(), ...changes }),
    { message: "LICENSING_RELEASE_READINESS_" + code },
  );
}

describe("read-only immutable Licensing release-readiness evidence", () => {
  it("binds an archived candidate to exact source, package tree, main and SHA-256", () => {
    const result = verifyLicensingReleaseReadiness(fixture());
    assert.deepEqual(result, {
      schemaVersion: 1,
      component: "@bke/licensing",
      version,
      certifiedRunId: 43153573142,
      certifiedSourceSha: source,
      certifiedSourceTreeSha: sourceTree,
      certifiedPackageTreeSha: packageTree,
      verifiedCurrentMainSha: main,
      verifiedCurrentPackageTreeSha: packageTree,
      tarballFilename: filename,
      tarballSha256: hash,
      state: "READ_ONLY_ELIGIBILITY_PROOF_NOT_A_RELEASE",
    });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(JSON.stringify(result).includes("privateKey"), false);
  });

  it("requires a real positive certified run ID", () => {
    reject({ certifiedRunId: 0 }, "RUN_ID_INVALID");
    reject({ certifiedRunId: Number.POSITIVE_INFINITY }, "RUN_ID_INVALID");
  });

  it("rejects invalid or non-canonical version notation", () => {
    reject({ version: "v0.10.0" }, "VERSION_INVALID");
    reject({ version: "0.10.0-dev" }, "VERSION_INVALID");
  });

  it("rejects invalid Git object IDs and stale current main", () => {
    reject({ certifiedSourceSha: "not-a-sha" }, "SOURCE_SHA_INVALID_certifiedSourceSha");
    reject({ actualMainSha: "e".repeat(40) }, "STALE_MAIN");
    reject({ currentPackageTreeSha: "e".repeat(40) }, "PACKAGE_SOURCE_DRIFT");
  });

  it("rejects missing/extra/untrusted provenance members", () => {
    reject({ manifest: { ...fixture().manifest, extra: "untrusted" } }, "PROVENANCE_SHAPE_INVALID");
    const { state, ...missing } = fixture().manifest;
    reject({ manifest: missing }, "PROVENANCE_SHAPE_INVALID");
    reject({ manifest: { ...fixture().manifest, state: "PUBLISHED" } }, "PROVENANCE_AUTHORITY_INVALID");
    reject({ manifest: { ...fixture().manifest, component: "@bke/payments" } }, "PROVENANCE_AUTHORITY_INVALID");
  });

  it("refuses mismatched signing source and tree despite matching tarball hash", () => {
    reject({ manifest: { ...fixture().manifest, sourceSha: "f".repeat(40) } }, "PROVENANCE_SOURCE_MISMATCH");
    reject({ manifest: { ...fixture().manifest, sourceTreeSha: "f".repeat(40) } }, "PROVENANCE_SOURCE_MISMATCH");
  });

  it("refuses version/file-name substitution", () => {
    reject({ manifest: { ...fixture().manifest, version: "0.9.0" } }, "PROVENANCE_VERSION_INVALID");
    reject({ manifest: { ...fixture().manifest, tarballFilename: "evil.tgz" } }, "PROVENANCE_VERSION_INVALID");
  });

  it("refuses byte tampering, wrong expected hash and invalid hash input", () => {
    reject({ archiveBytes: Buffer.from("TAMPERED") }, "TARBALL_HASH_MISMATCH");
    reject({ expectedTarballSha256: "0".repeat(64) }, "TARBALL_HASH_MISMATCH");
    reject({ expectedTarballSha256: "notsha" }, "EXPECTED_HASH_INVALID");
    reject({ archiveBytes: Buffer.alloc(0) }, "ARCHIVE_INVALID");
  });

  it("requires the independent sha256sum file to name the expected artifact", () => {
    reject({ sha256File: hash + "  artifacts/other.tgz" }, "CHECKSUM_FILE_MISMATCH");
    reject({ sha256File: "0".repeat(64) + "  artifacts/" + filename }, "CHECKSUM_FILE_MISMATCH");
  });

  it("rejects differently named or versioned packed package", () => {
    reject({ packedPackageJson: { name: "@bke/identity", version } }, "PACKED_PACKAGE_IDENTITY_MISMATCH");
    reject({ packedPackageJson: { name: "@bke/licensing", version: "0.9.0" } }, "PACKED_PACKAGE_IDENTITY_MISMATCH");
  });
});
