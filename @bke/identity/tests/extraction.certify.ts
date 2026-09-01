import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const violations: string[] = [];

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
    else if (sourceExtensions.has(extension(path))) files.push(path);
  }
  return files;
}

function isExtractableSource(sourceFile: string) {
  const path = relative(moduleRoot, sourceFile).split(sep).join("/");
  return (
    path === "module.manifest.ts" ||
    path.startsWith("contracts/") ||
    path.startsWith("logic/") ||
    path.startsWith("prisma/") ||
    path.startsWith("tests/") ||
    path.startsWith("providers/")
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

for (const sourceFile of collectFiles(moduleRoot).filter(isExtractableSource)) {
  const source = readFileSync(sourceFile, "utf8");
  for (const specifier of importsFrom(source)) {
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(sourceFile), specifier);
      if (!isWithin(moduleRoot, target)) {
        violations.push(
          `${relative(moduleRoot, sourceFile)} escapes Identity through ${specifier}`,
        );
      }
      continue;
    }

    if (
      specifier.startsWith("@/") ||
      specifier.startsWith("v2/") ||
      specifier === "next" ||
      specifier.startsWith("next/") ||
      specifier === "server-only"
    ) {
      violations.push(
        `${relative(moduleRoot, sourceFile)} imports application/runtime boundary ${specifier}`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error("Identity extraction boundary violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Identity extraction boundary GREEN");
