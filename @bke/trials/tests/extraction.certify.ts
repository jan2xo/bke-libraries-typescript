import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { trialsModuleManifest } from "../module.manifest";

const root = "@bke/trials";
const reusableRoots = [`${root}/contracts`, `${root}/logic`];

function filesUnder(path: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    if (statSync(child).isDirectory()) found.push(...filesUnder(child));
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(child))) found.push(child);
  }
  return found;
}

const files = [...reusableRoots.flatMap(filesUnder), `${root}/module.manifest.ts`];
const forbidden = [
  `${"@"}/bke/`, `${"@"}/`, "next/", '"server-only"', "v2/", "generated/prisma", "@prisma/", "from \"pg\"", "from 'pg'",
  "/modules/commerce/", "/modules/licensing/", "/modules/accounts/", "/modules/catalog/",
];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const marker of forbidden) assert.equal(text.includes(marker), false, `${file} contains forbidden marker: ${marker}`);
}
assert.equal(trialsModuleManifest.moduleId, "trials");
assert.deepEqual(trialsModuleManifest.needs, []);
assert.deepEqual(trialsModuleManifest.provides, ["trials.policy.v1"]);

const packageJson = JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as { name?: string; version?: string; dependencies?: Record<string, string> };
assert.equal(packageJson.name, "@bke/trials");
assert.equal(packageJson.version, "0.1.0");
assert.equal(Object.keys(packageJson.dependencies ?? {}).some((name) => name.startsWith("@bke/")), false);
console.log(`@bke/trials extraction GREEN: files=${files.length}`);
