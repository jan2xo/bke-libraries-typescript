import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const allowedRuntimeImports = new Set(["pg", "prisma/config", "vitest"]);
const allowedModels = new Set([
  "CommercialLeaseOperation",
  "CommercialSigningKey",
  "DeviceActivation",
  "License",
  "LicenseAssignment",
  "LicenseEvent",
  "LicenseLeaseRecord",
]);
const violations: string[] = [];

function normalize(path: string) {
  return path.split(sep).join("/");
}
function extension(path: string) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}
function collectFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) files.push(...collectFiles(path));
    else files.push(path);
  }
  return files;
}
function isPackageSource(sourceFile: string) {
  const path = normalize(relative(moduleRoot, sourceFile));
  if (!sourceExtensions.has(extension(path))) return false;
  if (path === "module.ts" || path === "tests/module-composition.test.ts") return false;
  return (
    path === "module.manifest.ts" ||
    path === "prisma.config.ts" ||
    path.startsWith("contracts/") ||
    path.startsWith("logic/") ||
    path.startsWith("providers/") ||
    path.startsWith("prisma/") ||
    path.startsWith("tests/")
  );
}
function importsFrom(source: string) {
  const imports: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }
  return imports;
}
function isWithin(parent: string, child: string) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}
function packageName(specifier: string) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}
function sqlTextFromPersistenceFile(path: string, source: string) {
  if (extension(path) === ".sql") return source;
  return [...source.matchAll(/`([\s\S]*?)`/g)].map((match) => match[1]).join("\n");
}

const requiredPaths = [
  "module.manifest.ts",
  "prisma.config.ts",
  "prisma/schema.prisma",
  "migrations/0001_licensing_baseline/migration.sql",
  "contracts",
  "logic",
  "providers",
  "prisma/repositories",
  "tests",
  "docs",
];
for (const path of requiredPaths) {
  if (!existsSync(resolve(moduleRoot, path))) violations.push(`missing extraction-owned path ${path}`);
}

const packageSources = collectFiles(moduleRoot).filter(isPackageSource);
for (const sourceFile of packageSources) {
  const sourcePath = normalize(relative(moduleRoot, sourceFile));
  const source = readFileSync(sourceFile, "utf8");
  for (const specifier of importsFrom(source)) {
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(sourceFile), specifier);
      if (!isWithin(moduleRoot, target)) {
        violations.push(`${sourcePath} escapes Licensing through ${specifier}`);
        continue;
      }
      const targetPath = normalize(relative(moduleRoot, target));
      if (targetPath === "module" || targetPath === "module.ts") {
        violations.push(`${sourcePath} imports host composition adapter ${specifier}`);
      }
      continue;
    }
    if (
      specifier.startsWith("@/") ||
      specifier.startsWith("v2/") ||
      specifier === "next" ||
      specifier.startsWith("next/") ||
      specifier === "server-only" ||
      specifier.startsWith("@bke/")
    ) {
      violations.push(`${sourcePath} imports application/cross-library boundary ${specifier}`);
      continue;
    }
    if (specifier.startsWith("node:")) continue;
    const dependency = packageName(specifier);
    if (!allowedRuntimeImports.has(specifier) && !allowedRuntimeImports.has(dependency)) {
      violations.push(`${sourcePath} imports undeclared extraction dependency ${specifier}`);
    }
  }
}

const schemaPath = resolve(moduleRoot, "prisma/schema.prisma");
if (existsSync(schemaPath)) {
  const schema = readFileSync(schemaPath, "utf8");
  const models = [...schema.matchAll(/^\s*model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
  for (const model of models) {
    if (!allowedModels.has(model)) violations.push(`Licensing Prisma owns foreign model ${model}`);
  }
  for (const expected of allowedModels) {
    if (!models.includes(expected)) violations.push(`Licensing Prisma is missing owned model ${expected}`);
  }
}

const persistenceFiles = collectFiles(resolve(moduleRoot, "prisma")).filter((path) =>
  [".ts", ".sql"].includes(extension(path)),
);
const tableReferencePattern =
  /\b(?:FROM|JOIN|UPDATE|INTO|REFERENCES|DELETE\s+FROM|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+"([A-Za-z0-9_]+)"/gi;
for (const persistenceFile of persistenceFiles) {
  const source = readFileSync(persistenceFile, "utf8");
  const sqlText = sqlTextFromPersistenceFile(persistenceFile, source);
  for (const match of sqlText.matchAll(tableReferencePattern)) {
    const table = match[1];
    if (!allowedModels.has(table)) {
      violations.push(`${normalize(relative(moduleRoot, persistenceFile))} references foreign table ${table}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Licensing extraction boundary violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log(
  `Licensing extraction boundary GREEN: ${packageSources.length} package-owned source files; host module.ts and module-composition.test.ts excluded`,
);
