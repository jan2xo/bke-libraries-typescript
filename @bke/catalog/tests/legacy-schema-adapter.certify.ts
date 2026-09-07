import { Client } from "pg";
import { createLegacySchemaCatalogLicensingVersionFactsRepository } from "../prisma/repositories/legacy-schema-licensing-version-facts-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Catalog legacy-schema certification.");

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(`
    DROP TABLE IF EXISTS "ProductVersion";
    DROP TABLE IF EXISTS "Product";
    CREATE TABLE "Product" (
      "id" TEXT PRIMARY KEY,
      "productId" TEXT UNIQUE,
      "minimumAcceptedVersion" TEXT,
      "maximumAcceptedVersion" TEXT
    );
    CREATE TABLE "ProductVersion" (
      "id" TEXT PRIMARY KEY,
      "productId" TEXT NOT NULL,
      "version" TEXT NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT TRUE
    );
  `);
  await client.query(
    `INSERT INTO "Product" ("id", "productId", "minimumAcceptedVersion", "maximumAcceptedVersion")
     VALUES ($1, $2, $3, $4)`,
    ["legacy-product-db-id", "bke-air-stack", "1.2.0", "2.x"],
  );
  await client.query(
    `INSERT INTO "ProductVersion" ("id", "productId", "version", "active") VALUES
      ('version-active', 'legacy-product-db-id', '1.2.3', TRUE),
      ('version-disabled', 'legacy-product-db-id', '1.2.4', FALSE)`,
  );

  const repository = createLegacySchemaCatalogLicensingVersionFactsRepository(connectionString);
  const active = await repository.findLicensingVersionFacts("legacy-product-db-id", "1.2.3");
  if (!active) throw new Error("Legacy Catalog product facts were not found.");
  if (active.catalogProductId !== "legacy-product-db-id") throw new Error("Catalog product id drifted.");
  if (active.externalProductId !== "bke-air-stack") throw new Error("External product identity drifted.");
  if (active.minimumAcceptedVersion !== "1.2.0" || active.maximumAcceptedVersion !== "2.x") {
    throw new Error("Accepted-version facts drifted.");
  }
  if (!active.versionEligible) throw new Error("Exact active legacy version must be eligible.");

  const disabled = await repository.findLicensingVersionFacts("legacy-product-db-id", "1.2.4");
  if (!disabled || disabled.versionEligible) throw new Error("Inactive legacy version must not be eligible.");

  const missing = await repository.findLicensingVersionFacts("missing-product", "1.2.3");
  if (missing !== null) throw new Error("Missing legacy product must return null.");

  console.log("Catalog legacy Product/ProductVersion compatibility repository GREEN");
} finally {
  await client.query('DROP TABLE IF EXISTS "ProductVersion"; DROP TABLE IF EXISTS "Product";').catch(() => undefined);
  await client.end();
}
