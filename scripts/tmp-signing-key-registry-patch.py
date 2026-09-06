from pathlib import Path
import json


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    source = target.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement, found {count}: {old[:120]!r}")
    target.write_text(source.replace(old, new, 1))

contract = Path("@bke/licensing/contracts/signing-key-registry.contract.ts")
contract.write_text('''export const LICENSING_SIGNING_KEY_REGISTRY_CAPABILITY_ID =\n  "bke.licensing.signing-key-registry.v1" as const;\n\nexport type LicensingSigningKeyStatus = "ACTIVE" | "RETIRED";\n\nexport type LicensingSigningKeyPublicSnapshot = Readonly<{\n  keyId: string;\n  algorithm: string;\n  publicKey: string;\n  status: LicensingSigningKeyStatus;\n  activatedAt: Date;\n  retiredAt: Date | null;\n}>;\n\nexport type LicensingSigningKeyActiveSnapshot = LicensingSigningKeyPublicSnapshot & Readonly<{\n  privateKeyReference: string;\n}>;\n\nexport interface LicensingSigningKeyRegistryCapability {\n  ensure(): Promise<void>;\n  active(): Promise<LicensingSigningKeyActiveSnapshot>;\n  listPublic(): Promise<readonly LicensingSigningKeyPublicSnapshot[]>;\n}\n''')

repo = Path("@bke/licensing/prisma/repositories/postgres-signing-key-registry-repository.ts")
repo.write_text('''import { Client } from "pg";\nimport type {\n  LicensingSigningKeyActiveSnapshot,\n  LicensingSigningKeyPublicSnapshot,\n  LicensingSigningKeyRegistryCapability,\n  LicensingSigningKeyStatus,\n} from "../../contracts/signing-key-registry.contract";\nimport type { CommercialSigningKeyBootstrap } from "../../logic/commercial-signing-registry";\nimport { createPostgresCommercialSigningKeyProvider } from "./postgres-commercial-signing-key-provider";\n\ntype PublicSigningKeyRow = {\n  keyId: string;\n  algorithm: string;\n  publicKey: string;\n  status: LicensingSigningKeyStatus;\n  activatedAt: Date;\n  retiredAt: Date | null;\n};\n\nexport function createPostgresLicensingSigningKeyRegistryCapability(\n  connectionString: string,\n  bootstrap?: CommercialSigningKeyBootstrap,\n): LicensingSigningKeyRegistryCapability {\n  const normalized = connectionString.trim();\n  if (!normalized) throw new Error("Licensing PostgreSQL connection string is required.");\n  const signingKeys = createPostgresCommercialSigningKeyProvider(normalized, bootstrap);\n\n  return Object.freeze({\n    ensure: () => signingKeys.ensure(),\n    async active(): Promise<LicensingSigningKeyActiveSnapshot> {\n      const key = await signingKeys.active();\n      return Object.freeze({\n        keyId: key.keyId,\n        algorithm: key.algorithm,\n        publicKey: key.publicKey,\n        status: "ACTIVE" as const,\n        activatedAt: new Date(key.activatedAt),\n        retiredAt: key.retiredAt ? new Date(key.retiredAt) : null,\n        privateKeyReference: key.privateKeyReference,\n      });\n    },\n    async listPublic(): Promise<readonly LicensingSigningKeyPublicSnapshot[]> {\n      const client = new Client({ connectionString: normalized });\n      await client.connect();\n      try {\n        const result = await client.query<PublicSigningKeyRow>(\n          `SELECT "keyId", "algorithm", "publicKey", "status", "activatedAt", "retiredAt"\n             FROM "CommercialSigningKey"\n            WHERE "status" IN ('ACTIVE', 'RETIRED')\n            ORDER BY "createdAt" ASC, "keyId" ASC`,\n        );\n        return Object.freeze(result.rows.map((row) => Object.freeze({\n          keyId: row.keyId,\n          algorithm: row.algorithm,\n          publicKey: row.publicKey,\n          status: row.status,\n          activatedAt: new Date(row.activatedAt),\n          retiredAt: row.retiredAt ? new Date(row.retiredAt) : null,\n        })));\n      } finally {\n        await client.end();\n      }\n    },\n  });\n}\n''')

cert = Path("@bke/licensing/tests/signing-key-registry.postgres.certify.ts")
cert.write_text('''import assert from "node:assert/strict";\nimport { Client } from "pg";\nimport { createPostgresLicensingSigningKeyRegistryCapability } from "../prisma/repositories/postgres-signing-key-registry-repository";\n\nconst connectionString = process.env.DATABASE_URL;\nif (!connectionString) throw new Error("DATABASE_URL_REQUIRED");\n\nconst registry = createPostgresLicensingSigningKeyRegistryCapability(connectionString, {\n  keyId: "cert-active",\n  publicKey: "CERT_PUBLIC_KEY",\n  privateKeyReference: "env:CERT_PRIVATE_KEY",\n});\nawait registry.ensure();\nconst first = await registry.active();\nassert.equal(first.keyId, "cert-active");\nassert.equal(first.status, "ACTIVE");\nassert.equal(first.privateKeyReference, "env:CERT_PRIVATE_KEY");\n\nconst client = new Client({ connectionString });\nawait client.connect();\ntry {\n  await client.query(\n    `INSERT INTO "CommercialSigningKey"\n      ("id", "keyId", "algorithm", "status", "publicKey", "privateKeyReference", "retiredAt")\n     VALUES ('cert-retired-id', 'cert-retired', 'Ed25519', 'RETIRED', 'RETIRED_PUBLIC_KEY', 'env:RETIRED_PRIVATE_KEY', NOW())\n     ON CONFLICT ("keyId") DO NOTHING`,\n  );\n} finally {\n  await client.end();\n}\n\nconst publicKeys = await registry.listPublic();\nassert.deepEqual(publicKeys.map((key) => [key.keyId, key.status]), [\n  ["cert-active", "ACTIVE"],\n  ["cert-retired", "RETIRED"],\n]);\nassert.equal("privateKeyReference" in publicKeys[0]!, false);\nconsole.log("Licensing signing-key registry PostgreSQL certification GREEN");\n''')

replace_once(
    "@bke/licensing/module.manifest.ts",
    'import { LICENSING_TRANSFER_POLICY_CAPABILITY_ID } from "./contracts/transfer-policy.contract";',
    'import { LICENSING_TRANSFER_POLICY_CAPABILITY_ID } from "./contracts/transfer-policy.contract";\nimport { LICENSING_SIGNING_KEY_REGISTRY_CAPABILITY_ID } from "./contracts/signing-key-registry.contract";',
)
replace_once(
    "@bke/licensing/module.manifest.ts",
    '    LICENSING_TRANSFER_POLICY_CAPABILITY_ID,\n  ],',
    '    LICENSING_TRANSFER_POLICY_CAPABILITY_ID,\n    LICENSING_SIGNING_KEY_REGISTRY_CAPABILITY_ID,\n  ],',
)

package_path = Path("@bke/licensing/package.json")
package_json = json.loads(package_path.read_text())
if package_json["version"] != "0.6.0":
    raise SystemExit(f"Unexpected Licensing version: {package_json['version']}")
package_json["version"] = "0.7.0"
package_path.write_text(json.dumps(package_json, indent=2) + "\n")

replace_once(
    ".github/workflows/licensing.yml",
    '      - name: Certify Licensing transfer-policy lookup on PostgreSQL\n        run: npx tsx @bke/licensing/tests/transfer-policy.postgres.certify.ts',
    '      - name: Certify Licensing transfer-policy lookup on PostgreSQL\n        run: npx tsx @bke/licensing/tests/transfer-policy.postgres.certify.ts\n      - name: Certify Licensing signing-key registry on PostgreSQL\n        run: npx tsx @bke/licensing/tests/signing-key-registry.postgres.certify.ts',
)

replace_once(
    ".github/workflows/licensing-package.yml",
    "          grep -Fx 'package/contracts/transfer-policy.contract.ts' artifacts/package-contents.txt",
    "          grep -Fx 'package/contracts/transfer-policy.contract.ts' artifacts/package-contents.txt\n          grep -Fx 'package/contracts/signing-key-registry.contract.ts' artifacts/package-contents.txt",
)
replace_once(
    ".github/workflows/licensing-package.yml",
    "          grep -Fx 'package/prisma/repositories/postgres-transfer-policy-repository.ts' artifacts/package-contents.txt",
    "          grep -Fx 'package/prisma/repositories/postgres-transfer-policy-repository.ts' artifacts/package-contents.txt\n          grep -Fx 'package/prisma/repositories/postgres-signing-key-registry-repository.ts' artifacts/package-contents.txt",
)
replace_once(
    ".github/workflows/licensing-package.yml",
    '          import { LICENSING_TRANSFER_POLICY_CAPABILITY_ID, isTransferAllowed, type LicensingTransferPolicyCapability } from "@bke/licensing/contracts/transfer-policy.contract";',
    '          import { LICENSING_TRANSFER_POLICY_CAPABILITY_ID, isTransferAllowed, type LicensingTransferPolicyCapability } from "@bke/licensing/contracts/transfer-policy.contract";\n          import { LICENSING_SIGNING_KEY_REGISTRY_CAPABILITY_ID, type LicensingSigningKeyRegistryCapability } from "@bke/licensing/contracts/signing-key-registry.contract";',
)
replace_once(
    ".github/workflows/licensing-package.yml",
    '          import { createPostgresLicensingTransferPolicyCapability } from "@bke/licensing/prisma/repositories/postgres-transfer-policy-repository";',
    '          import { createPostgresLicensingTransferPolicyCapability } from "@bke/licensing/prisma/repositories/postgres-transfer-policy-repository";\n          import { createPostgresLicensingSigningKeyRegistryCapability } from "@bke/licensing/prisma/repositories/postgres-signing-key-registry-repository";',
)
replace_once(
    ".github/workflows/licensing-package.yml",
    '          if (LICENSING_TRANSFER_POLICY_CAPABILITY_ID !== "bke.licensing.transfer-policy.v1") throw new Error("Unexpected transfer policy capability id.");',
    '          if (LICENSING_TRANSFER_POLICY_CAPABILITY_ID !== "bke.licensing.transfer-policy.v1") throw new Error("Unexpected transfer policy capability id.");\n          if (LICENSING_SIGNING_KEY_REGISTRY_CAPABILITY_ID !== "bke.licensing.signing-key-registry.v1") throw new Error("Unexpected signing-key registry capability id.");',
)
replace_once(
    ".github/workflows/licensing-package.yml",
    '          if (!licensingModuleManifest.provides.includes(LICENSING_TRANSFER_POLICY_CAPABILITY_ID)) throw new Error("Transfer policy capability missing from manifest.");',
    '          if (!licensingModuleManifest.provides.includes(LICENSING_TRANSFER_POLICY_CAPABILITY_ID)) throw new Error("Transfer policy capability missing from manifest.");\n          if (!licensingModuleManifest.provides.includes(LICENSING_SIGNING_KEY_REGISTRY_CAPABILITY_ID)) throw new Error("Signing-key registry capability missing from manifest.");',
)
replace_once(
    ".github/workflows/licensing-package.yml",
    '            typeof createPostgresLicensingTransferPolicyCapability !== "function" ||\n            typeof isTransferAllowed !== "function"',
    '            typeof createPostgresLicensingTransferPolicyCapability !== "function" ||\n            typeof createPostgresLicensingSigningKeyRegistryCapability !== "function" ||\n            typeof isTransferAllowed !== "function"',
)
replace_once(
    ".github/workflows/licensing-package.yml",
    '          const transferPolicy: LicensingTransferPolicyCapability = createPostgresLicensingTransferPolicyCapability("postgresql://unused:unused@localhost/unused");',
    '          const transferPolicy: LicensingTransferPolicyCapability = createPostgresLicensingTransferPolicyCapability("postgresql://unused:unused@localhost/unused");\n          const signingKeyRegistry: LicensingSigningKeyRegistryCapability = createPostgresLicensingSigningKeyRegistryCapability("postgresql://unused:unused@localhost/unused");\n          if (typeof signingKeyRegistry.ensure !== "function" || typeof signingKeyRegistry.active !== "function" || typeof signingKeyRegistry.listPublic !== "function") throw new Error("Packed signing-key registry missing.");',
)

print("signing-key registry prerequisite patch applied")
