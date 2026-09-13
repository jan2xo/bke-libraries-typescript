import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { privacyModuleManifest } from "../module.manifest";

const root = "@bke/privacy";
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
  `${"@"}/bke/`, `${"@"}/`, "next/", '"server-only"', "v2/", "generated/prisma", "prisma/",
  "/modules/accounts/", "/modules/legal/", "/modules/commerce/", "/modules/licensing/",
];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const marker of forbidden) assert.equal(text.includes(marker), false, `${file} contains forbidden marker: ${marker}`);
}
assert.deepEqual(privacyModuleManifest, {
  moduleId: "privacy",
  needs: [],
  provides: ["privacy.request-policy.v1"],
});
console.log(`@bke/privacy extraction GREEN: files=${files.length}`);
