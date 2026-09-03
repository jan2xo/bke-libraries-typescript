import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { catalogModuleManifest } from "../module.manifest";

const root = "@bke/catalog";
const reusableRoots = [`${root}/contracts`, `${root}/logic`, `${root}/prisma/repositories`];
const files = [
  ...reusableRoots.flatMap(function filesUnder(path: string): string[] {
    const found: string[] = [];
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      if (statSync(child).isDirectory()) found.push(...filesUnder(child));
      else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(child))) found.push(child);
    }
    return found;
  }),
  `${root}/module.manifest.ts`,
];
const forbidden = [
  `${"@"}/bke/`, `${"@"}/`, "next/", '"server-only"', "v2/", "generated/prisma",
  "/modules/commerce/", "/modules/payments/", "/modules/entitlements/", "/modules/licensing/", "/modules/distribution/",
];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const marker of forbidden) assert.equal(text.includes(marker), false, `${file} contains forbidden marker: ${marker}`);
}
assert.equal(catalogModuleManifest.moduleId, "catalog");
assert.deepEqual(catalogModuleManifest.needs, []);
assert.deepEqual(catalogModuleManifest.provides, ["bke.catalog.lookup.v1", "bke.catalog.management.v1"]);
const schema = readFileSync(`${root}/prisma/schema.prisma`, "utf8");
const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]).sort();
assert.deepEqual(models, ["CatalogEdition", "CatalogProduct"]);
const migrations = readdirSync(`${root}/migrations`).filter((name) => statSync(join(`${root}/migrations`, name)).isDirectory()).sort();
assert.deepEqual(migrations, ["0001_catalog_product_edition"]);
console.log(`@bke/catalog extraction GREEN: files=${files.length} models=${models.join(",")} migrations=${migrations.join(",")}`);
