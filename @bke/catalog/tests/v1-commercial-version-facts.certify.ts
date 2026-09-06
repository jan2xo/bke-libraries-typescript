import assert from "node:assert/strict";
import { isExactActiveProductVersionEligible } from "../logic/licensing-version-facts";

type VersionFact = Readonly<{ version: string; active: boolean; lifecycle: string }>;

function v1Oracle(versions: readonly VersionFact[], requestedVersion: string): boolean {
  return versions.some((candidate) => candidate.version === requestedVersion && candidate.active === true);
}

const lifecycles = ["DRAFT", "INTERNAL", "ALPHA", "BETA", "RELEASE_CANDIDATE", "STABLE", "LTS", "DEPRECATED", "ARCHIVED"];
const requestedVersions = ["1.0.0", "1.0.1", "2.0.0", " 1.0.0 ", "not-semver"];
let comparisons = 0;

for (const lifecycle of lifecycles) {
  for (const active of [false, true]) {
    const versions: VersionFact[] = [
      { version: "1.0.0", active, lifecycle },
      { version: "2.0.0", active: !active, lifecycle: lifecycle === "STABLE" ? "DRAFT" : "STABLE" },
    ];
    for (const requestedVersion of requestedVersions) {
      assert.equal(
        isExactActiveProductVersionEligible(versions, requestedVersion),
        v1Oracle(versions, requestedVersion),
        `V1 mismatch lifecycle=${lifecycle} active=${active} requested=${JSON.stringify(requestedVersion)}`,
      );
      comparisons += 1;
    }
  }
}

assert.equal(comparisons, 90);
console.log(`Catalog V1 commercial software-version facts differential GREEN: ${comparisons} exact outcomes matched.`);
