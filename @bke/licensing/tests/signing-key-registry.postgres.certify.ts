import assert from "node:assert/strict";
import { Client } from "pg";
import { createPostgresLicensingSigningKeyRegistryCapability } from "../prisma/repositories/postgres-signing-key-registry-repository";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL_REQUIRED");

const registry = createPostgresLicensingSigningKeyRegistryCapability(connectionString, {
  keyId: "cert-active",
  publicKey: "CERT_PUBLIC_KEY",
  privateKeyReference: "env:CERT_PRIVATE_KEY",
});
await registry.ensure();
const first = await registry.active();
assert.equal(first.keyId, "cert-active");
assert.equal(first.status, "ACTIVE");
assert.equal(first.privateKeyReference, "env:CERT_PRIVATE_KEY");

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `INSERT INTO "CommercialSigningKey"
      ("id", "keyId", "algorithm", "status", "publicKey", "privateKeyReference", "retiredAt")
     VALUES ('cert-retired-id', 'cert-retired', 'Ed25519', 'RETIRED', 'RETIRED_PUBLIC_KEY', 'env:RETIRED_PRIVATE_KEY', NOW())
     ON CONFLICT ("keyId") DO NOTHING`,
  );
} finally {
  await client.end();
}

const publicKeys = await registry.listPublic();
assert.deepEqual(publicKeys.map((key) => [key.keyId, key.status]), [
  ["cert-active", "ACTIVE"],
  ["cert-retired", "RETIRED"],
]);
assert.equal("privateKeyReference" in publicKeys[0]!, false);
console.log("Licensing signing-key registry PostgreSQL certification GREEN");
