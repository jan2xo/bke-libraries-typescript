import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const MANIFEST_FIELDS = Object.freeze([
  "schemaVersion", "component", "version", "sourceSha",
  "sourceTreeSha", "tarballFilename", "tarballSha256", "state",
]);

function invariant(condition, code) {
  if (!condition) throw new Error("LICENSING_RELEASE_READINESS_" + code);
}
function hexSha(value) {
  return typeof value === "string" && SHA.test(value);
}
function hexHash(value) {
  return typeof value === "string" && HASH.test(value);
}

/**
 * Pure fail-closed comparator for a separately trusted GitHub Actions artifact.
 * The invoking workflow MUST independently authenticate run identity/status,
 * verify all git object IDs, ensure remote-main consistency, and download the
 * original certified tarball; fields supplied by an attacker are not proof.
 */
export function verifyLicensingReleaseReadiness(input) {
  const {
    manifest, archiveBytes, sha256File, packedPackageJson,
    expectedMainSha, actualMainSha, certifiedSourceSha,
    verifiedSourceTreeSha, certifiedPackageTreeSha, currentPackageTreeSha,
    expectedTarballSha256, version, certifiedRunId,
  } = input;

  invariant(Number.isSafeInteger(certifiedRunId) && certifiedRunId > 0, "RUN_ID_INVALID");
  invariant(typeof version === "string" && SEMVER.test(version), "VERSION_INVALID");
  for (const [name, value] of Object.entries({
    expectedMainSha, actualMainSha, certifiedSourceSha,
    verifiedSourceTreeSha, certifiedPackageTreeSha, currentPackageTreeSha,
  })) invariant(hexSha(value), "SOURCE_SHA_INVALID_" + name);
  invariant(expectedMainSha === actualMainSha, "STALE_MAIN");
  invariant(certifiedPackageTreeSha === currentPackageTreeSha, "PACKAGE_SOURCE_DRIFT");
  invariant(hexHash(expectedTarballSha256), "EXPECTED_HASH_INVALID");

  invariant(manifest !== null && typeof manifest === "object" &&
    !Array.isArray(manifest) && Object.keys(manifest).length === MANIFEST_FIELDS.length &&
    MANIFEST_FIELDS.every(field => Object.hasOwn(manifest, field)),
  "PROVENANCE_SHAPE_INVALID");
  const filename = "bke-licensing-" + version + ".tgz";
  invariant(manifest.schemaVersion === 1 &&
    manifest.component === "@bke/licensing" &&
    manifest.state === "CERTIFIED_UNPUBLISHED_CANDIDATE",
  "PROVENANCE_AUTHORITY_INVALID");
  invariant(manifest.version === version && manifest.tarballFilename === filename,
    "PROVENANCE_VERSION_INVALID");
  invariant(manifest.sourceSha === certifiedSourceSha &&
    manifest.sourceTreeSha === verifiedSourceTreeSha,
  "PROVENANCE_SOURCE_MISMATCH");

  invariant(Buffer.isBuffer(archiveBytes) && archiveBytes.length > 0 &&
    archiveBytes.length < 200_000_000, "ARCHIVE_INVALID");
  const actualHash = createHash("sha256").update(archiveBytes).digest("hex");
  invariant(actualHash === expectedTarballSha256 && manifest.tarballSha256 === actualHash,
    "TARBALL_HASH_MISMATCH");
  invariant(typeof sha256File === "string" &&
    sha256File.trimEnd() === actualHash + "  artifacts/" + filename,
  "CHECKSUM_FILE_MISMATCH");
  invariant(packedPackageJson !== null && typeof packedPackageJson === "object" &&
    !Array.isArray(packedPackageJson) &&
    packedPackageJson.name === "@bke/licensing" &&
    packedPackageJson.version === version,
  "PACKED_PACKAGE_IDENTITY_MISMATCH");

  // No keys, passwords, HTTP requests or publication operations in evidence.
  return Object.freeze({
    schemaVersion: 1,
    component: "@bke/licensing",
    version,
    certifiedRunId,
    certifiedSourceSha,
    certifiedSourceTreeSha: verifiedSourceTreeSha,
    certifiedPackageTreeSha,
    verifiedCurrentMainSha: actualMainSha,
    verifiedCurrentPackageTreeSha: currentPackageTreeSha,
    tarballFilename: filename,
    tarballSha256: actualHash,
    state: "READ_ONLY_ELIGIBILITY_PROOF_NOT_A_RELEASE",
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const e = process.env;
    const version = e.READINESS_VERSION;
    invariant(typeof version === "string" && SEMVER.test(version), "VERSION_INVALID");
    const filename = "bke-licensing-" + version + ".tgz";
    const archiveDir = resolve(e.READINESS_ARTIFACT_DIR ?? "verified");
    const verified = verifyLicensingReleaseReadiness({
      manifest: JSON.parse(readFileSync(join(archiveDir, "licensing-package-provenance.json"), "utf8")),
      archiveBytes: readFileSync(join(archiveDir, filename)),
      sha256File: readFileSync(join(archiveDir, filename + ".sha256"), "utf8"),
      packedPackageJson: JSON.parse(readFileSync(join(archiveDir, "packed-package.json"), "utf8")),
      expectedMainSha: e.READINESS_EXPECTED_MAIN_SHA,
      actualMainSha: e.GITHUB_SHA,
      certifiedSourceSha: e.READINESS_CERTIFIED_SOURCE_SHA,
      verifiedSourceTreeSha: e.READINESS_VERIFIED_SOURCE_TREE_SHA,
      certifiedPackageTreeSha: e.READINESS_CERTIFIED_PACKAGE_TREE_SHA,
      currentPackageTreeSha: e.READINESS_CURRENT_PACKAGE_TREE_SHA,
      expectedTarballSha256: e.READINESS_EXPECTED_TARBALL_SHA256,
      version,
      certifiedRunId: Number(e.READINESS_CERTIFIED_RUN_ID),
    });
    mkdirSync("readiness-evidence", { recursive: true });
    writeFileSync(
      join("readiness-evidence", "licensing-release-readiness.json"),
      JSON.stringify(verified, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log("PASS: read-only candidate release-readiness proof for " +
      version + " at main " + verified.verifiedCurrentMainSha);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "READINESS_FAILED");
    process.exitCode = 1;
  }
}
