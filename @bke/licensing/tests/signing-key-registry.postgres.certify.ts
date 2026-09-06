import assert from "node:assert/strict";
import { Client } from "pg";
import { createPostgresLicensingSigningKeyRegistryCapability } from "../prisma/repositories/postgres-signing-key-registry-repository";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL_REQUIRED");

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `UPDATE "CommercialSigningKey"
        SET "status" = 'RETIRED', "retiredAt" = COALESCE("retiredAt", NOW())
      WHERE "status" = 'ACTIVE'`,
  );
  await client.query(
    `DELETE FROM "CommercialSigningKey"
      WHERE "keyId" IN ('cert-active', 'cert-retired')`,
  );
} finally {
  await client.end();
}

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

const fixtureClient = new Client({ connectionString });
await fixtureClient.connect();
try {
  await fixtureClient.query(
    `INSERT INTO "CommercialSigningKey"
      ("id", "keyId", "algorithm", "status", "publicKey", "privateKeyReference", "retiredAt")
     VALUES ('cert-retired-id', 'cert-retired', 'Ed25519', 'RETIRED', 'RETIRED_PUBLIC_KEY', 'env:RETIRED_PRIVATE_KEY', NOW())`,
  );
} finally {
  await fixtureClient.end();
}

const publicKeys = await registry.listPublic();
const fixtureKeys = publicKeys.filter((key) => key.keyId.startsWith("cert-"));
assert.deepEqual(fixtureKeys.map((key) => [key.keyId, key.status]), [
  ["cert-active", "ACTIVE"],
  ["cert-retired", "RETIRED"],
]);
assert.equal(fixtureKeys.every((key) => !("privateKeyReference" in key)), true);
console.log("Licensing signing-key registry PostgreSQL certification GREEN");
