import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reusableRoots = ["contracts", "logic", "prisma/repositories"] as const;
function filesUnder(name: string): string[] {
  const absolute = resolve(root, name);
  if (!existsSync(absolute)) throw new Error(`Missing Commerce package root: ${name}`);
  const files: string[] = [];
  const visit = (path: string) => {
    for (const childName of readdirSync(path)) {
      const child = join(path, childName);
      if (statSync(child).isDirectory()) visit(child);
      else if (child.endsWith(".ts")) files.push(child);
    }
  };
  visit(absolute);
  return files;
}

const files = [...reusableRoots.flatMap(filesUnder), resolve(root, "module.manifest.ts")];
const at = "@";
const forbidden = [
  `from "${at}bke/`, `from '${at}bke/`, `from "${at}/`, `from '${at}/`,
  'from "next/', "from 'next/", 'from "server-only"', "from 'server-only'",
  "/v2/platform/", "/v2/apps/", "../../contracts/capability",
];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const marker of forbidden) {
    if (source.includes(marker)) throw new Error(`Commerce package leaks host/cross-library dependency: ${relative(root, file)} -> ${marker}`);
  }
}

const manifest = readFileSync(resolve(root, "module.manifest.ts"), "utf8");
if (!manifest.includes("needs: []") || !manifest.includes("CommerceModuleManifest")) {
  throw new Error("Commerce package manifest must remain host-independent and package-owned.");
}
if (existsSync(resolve(root, "module.ts"))) throw new Error("Digital Solutions Commerce host adapter must not ship in @bke/commerce.");

const migrations = readdirSync(resolve(root, "migrations")).filter((name) => statSync(resolve(root, "migrations", name)).isDirectory()).sort();
const expectedMigrations = ["0001_commerce_purchase_plan_baseline", "0002_commerce_offers_redemptions", "0003_commerce_orders_invoices"];
if (JSON.stringify(migrations) !== JSON.stringify(expectedMigrations)) throw new Error(`Commerce migration set drifted: ${JSON.stringify(migrations)}`);

const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]).sort();
const expectedModels = ["DiscountOffer", "Invoice", "InvoiceLine", "OfferRedemption", "Order", "OrderItem", "Price", "PurchasePlan"].sort();
if (JSON.stringify(models) !== JSON.stringify(expectedModels)) throw new Error(`Commerce schema contains foreign/unexpected models: ${JSON.stringify(models)}`);

const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { name?: string; version?: string; dependencies?: Record<string, string> };
if (packageJson.name !== "@bke/commerce" || packageJson.version !== "0.3.0") throw new Error("Unexpected Commerce package identity.");
for (const dependency of Object.keys(packageJson.dependencies ?? {})) {
  if (dependency.startsWith("@bke/")) throw new Error(`Commerce package must not depend directly on sibling BKE library: ${dependency}`);
}

console.log(`Commerce library extraction boundary GREEN: files=${files.length} models=${models.length} migrations=${migrations.length}`);
