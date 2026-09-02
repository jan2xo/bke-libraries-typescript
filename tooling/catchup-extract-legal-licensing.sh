#!/usr/bin/env bash
set -euo pipefail

LEGAL_SHA="a69e983969c0c96480b6fda39d7405384f3effa0"
LICENSING_SHA="1ca7abf353ffcce0f904c7b935763ad3f0c0616c"
SOURCE_REPO="https://github.com/jan2xo/bke-digital-solutions.git"
SOURCE_DIR="$(mktemp -d)"
trap 'rm -rf "$SOURCE_DIR"' EXIT

git clone --quiet --filter=blob:none --no-checkout "$SOURCE_REPO" "$SOURCE_DIR/source"
cd "$SOURCE_DIR/source"
git fetch --quiet origin "$LEGAL_SHA" "$LICENSING_SHA"
cd - >/dev/null

extract_module() {
  local module="$1"
  local sha="$2"
  local package_dir="@bke/$module"
  local unpack="$SOURCE_DIR/$module"

  mkdir -p "$unpack"
  git -C "$SOURCE_DIR/source" archive "$sha" "v2/modules/$module" | tar -x -C "$unpack"
  local src="$unpack/v2/modules/$module"

  rm -rf "$package_dir"
  mkdir -p "$package_dir/contracts" "$package_dir/logic" "$package_dir/prisma/repositories" "$package_dir/migrations" "$package_dir/tests" "$package_dir/docs"

  cp -R "$src/contracts/." "$package_dir/contracts/"
  cp -R "$src/logic/." "$package_dir/logic/"
  if [[ -d "$src/providers" ]]; then
    mkdir -p "$package_dir/providers"
    cp -R "$src/providers/." "$package_dir/providers/"
  fi
  cp "$src/prisma/schema.prisma" "$package_dir/prisma/schema.prisma"
  cp -R "$src/prisma/repositories/." "$package_dir/prisma/repositories/"
  cp -R "$src/prisma/migrations/." "$package_dir/migrations/"
  cp -R "$src/docs/." "$package_dir/docs/"
  cp "$src/module.manifest.ts" "$package_dir/module.manifest.ts"
  cp "$src/prisma.config.ts" "$package_dir/prisma.config.ts"

  find "$src/test" -maxdepth 1 -type f \( -name '*.test.ts' -o -name '*.certify.ts' \) ! -name 'module-composition.test.ts' -print0 |
    while IFS= read -r -d '' file; do cp "$file" "$package_dir/tests/$(basename "$file")"; done

  python3 - "$package_dir" "$module" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
module = sys.argv[2]
config = root / "prisma.config.ts"
config.write_text(config.read_text().replace('path: "prisma/migrations"', 'path: "migrations"'))
cert = root / "tests" / "extraction.certify.ts"
text = cert.read_text()
text = text.replace('path === "test/module-composition.test.ts"', 'path === "tests/module-composition.test.ts"')
text = text.replace('path.startsWith("test/")', 'path.startsWith("tests/")')
text = text.replace('"test",', '"tests",')
text = text.replace(f'"prisma/migrations/0001_{module}_baseline/migration.sql"', f'"migrations/0001_{module}_baseline/migration.sql"')
if module == "legal":
    text = text.replace('"prisma/migrations/0001_legal_acceptance_baseline/migration.sql"', '"migrations/0001_legal_acceptance_baseline/migration.sql"')
cert.write_text(text)
iso = root / "tests" / "persistence-isolation.certify.ts"
iso.write_text(iso.read_text().replace('_bke_module_migrations', '_prisma_migrations'))
PY
}

extract_module legal "$LEGAL_SHA"
extract_module licensing "$LICENSING_SHA"

cat > @bke/legal/package.json <<'EOF'
{
  "name": "@bke/legal",
  "version": "0.1.0",
  "description": "Reusable BKE Legal acceptance capability library",
  "type": "module",
  "engines": { "node": ">=22.12.0" },
  "files": [
    "contracts",
    "logic",
    "prisma",
    "migrations",
    "docs",
    "module.manifest.ts",
    "prisma.config.ts",
    "README.md"
  ],
  "exports": {
    "./contracts/*": "./contracts/*.ts",
    "./logic/*": "./logic/*.ts",
    "./prisma/repositories/*": "./prisma/repositories/*.ts",
    "./module.manifest": "./module.manifest.ts",
    "./prisma.config": "./prisma.config.ts",
    "./package.json": "./package.json"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run tests/*.test.ts",
    "prisma:validate": "prisma validate --config prisma.config.ts",
    "prisma:deploy": "prisma migrate deploy --config prisma.config.ts"
  },
  "dependencies": { "pg": "^8.16.3" }
}
EOF

cat > @bke/licensing/package.json <<'EOF'
{
  "name": "@bke/licensing",
  "version": "0.1.0",
  "description": "Reusable BKE Licensing capability library",
  "type": "module",
  "engines": { "node": ">=22.12.0" },
  "files": [
    "contracts",
    "logic",
    "providers",
    "prisma",
    "migrations",
    "docs",
    "module.manifest.ts",
    "prisma.config.ts",
    "README.md"
  ],
  "exports": {
    "./contracts/*": "./contracts/*.ts",
    "./logic/*": "./logic/*.ts",
    "./providers/*": "./providers/*.ts",
    "./prisma/repositories/*": "./prisma/repositories/*.ts",
    "./module.manifest": "./module.manifest.ts",
    "./prisma.config": "./prisma.config.ts",
    "./package.json": "./package.json"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run tests/*.test.ts",
    "prisma:validate": "prisma validate --config prisma.config.ts",
    "prisma:deploy": "prisma migrate deploy --config prisma.config.ts"
  },
  "dependencies": { "pg": "^8.16.3" }
}
EOF

for module in legal licensing; do
  cat > "@bke/$module/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["node", "vitest/globals"]
  },
  "include": [
    "contracts/**/*.ts",
    "logic/**/*.ts",
    "providers/**/*.ts",
    "prisma/**/*.ts",
    "tests/**/*.ts",
    "module.manifest.ts",
    "prisma.config.ts"
  ]
}
EOF
done

cat > @bke/legal/README.md <<EOF
# @bke/legal

Reusable BKE Legal acceptance capability extracted from Digital Solutions V2.

Certified staging source: \`$LEGAL_SHA\`.

## Boundary

- **What I need:** opaque principal/account IDs and exact legal document/version/rendered-content evidence.
- **What I own:** Legal document versions, acceptance records, validation, recording, lookup.
- **What I give:** \`bke.legal.acceptance.v1\`.

Checkout policy decides whether Legal is required. This package never fabricates acceptance for a \`NOT_REQUIRED\` path.
EOF

cat > @bke/licensing/README.md <<EOF
# @bke/licensing

Reusable BKE Licensing capability extracted from Digital Solutions V2.

Certified staging source: \`$LICENSING_SHA\`.

## Boundary

- **What I need:** opaque license/runtime identifiers and encrypted key material.
- **What I own:** licensing persistence, key-reveal policy, decryption and clock seams.
- **What I give:** \`bke.licensing.license-key-reveal.v1\`.

Entitlements and checkout orchestration stay outside this package.
EOF

npm install --package-lock-only --ignore-scripts

echo "Catch-up extraction prepared for @bke/legal and @bke/licensing."
