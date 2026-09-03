import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function filesUnder(root: string): string[] {
  const absolute = resolve(packageRoot, root);
  if (!existsSync(absolute)) throw new Error(`Missing Notifications package root: ${root}`);
  const files: string[] = [];
  const visit = (path: string) => {
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      if (statSync(child).isDirectory()) visit(child);
      else if (child.endsWith(".ts")) files.push(child);
    }
  };
  visit(absolute);
  return files;
}

const reusableFiles = [
  ...filesUnder("contracts"),
  ...filesUnder("logic"),
  resolve(packageRoot, "module.manifest.ts"),
];
const at = "@";
const forbiddenMarkers = [
  `from \"${at}bke/`,
  `from '${at}bke/`,
  `from \"${at}/`,
  `from '${at}/`,
  'from "next/',
  "from 'next/",
  'from "server-only"',
  "from 'server-only'",
  "/v2/",
];

for (const file of reusableFiles) {
  const source = readFileSync(file, "utf8");
  for (const marker of forbiddenMarkers) {
    if (source.includes(marker)) {
      throw new Error(`Notifications package leaks host/cross-library dependency: ${relative(packageRoot, file)} -> ${marker}`);
    }
  }
}

for (const forbiddenPath of ["prisma", "migrations", "repositories", "providers", "node_modules"]) {
  if (existsSync(resolve(packageRoot, forbiddenPath))) {
    throw new Error(`Notifications v0.1.0 must remain persistence/transport free: ${forbiddenPath}`);
  }
}

const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
};
if (packageJson.name !== "@bke/notifications" || packageJson.version !== "0.1.0") {
  throw new Error(`Unexpected Notifications package identity: ${JSON.stringify(packageJson)}`);
}
if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) {
  throw new Error("Notifications v0.1.0 must not gain runtime dependencies without an explicit boundary decision.");
}

const manifestSource = readFileSync(resolve(packageRoot, "module.manifest.ts"), "utf8");
if (!manifestSource.includes("needs: []") || !manifestSource.includes("NOTIFICATIONS_INTENT_CAPABILITY_ID")) {
  throw new Error("Notifications standalone manifest drifted.");
}

console.log(`@bke/notifications extraction boundary GREEN: reusableFiles=${reusableFiles.length} runtimeDependencies=0 persistence=none transport=none`);
