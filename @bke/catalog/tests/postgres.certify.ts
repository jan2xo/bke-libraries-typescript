import assert from "node:assert/strict";
import { Client } from "pg";
import { createCatalogLookupCapability, createCatalogManagementCapability } from "../logic/catalog";
import { createCatalogLicensingVersionFactsCapability } from "../logic/licensing-version-facts";
import { createPostgresCatalogRepository } from "../prisma/repositories/postgres-catalog-repository";
import { createPostgresCatalogLicensingVersionFactsRepository } from "../prisma/repositories/postgres-licensing-version-facts-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Catalog PostgreSQL certification.");

const repository = createPostgresCatalogRepository(connectionString);
const management = createCatalogManagementCapability(repository);
const lookup = createCatalogLookupCapability(repository);
const licensingFacts = createCatalogLicensingVersionFactsCapability(
  createPostgresCatalogLicensingVersionFactsRepository(connectionString),
);

const script = await management.createProduct({
  slug: "daily-vlog-script",
  productId: "bke-daily-vlog-script",
  name: "Daily Vlog Script",
  summary: "Reusable automation script",
  description: "Catalog certification script product",
  kind: "SCRIPT",
  tags: ["automation", "video"],
});
assert.equal(script.status, "OK");
if (script.status !== "OK") throw new Error("Catalog script creation failed.");

const edition = await management.createEdition({
  productId: script.value.id,
  slug: "standard",
  name: "Standard",
  features: { runtime: "projectfreedom", delivery: "download" },
  maxUsers: 1,
  maxDevicesPerUser: 3,
  updatePolicy: "LIFETIME",
});
assert.equal(edition.status, "OK");
if (edition.status !== "OK") throw new Error("Catalog edition creation failed.");

const published = await management.publishProduct(script.value.id);
assert.equal(published.status, "OK");
if (published.status !== "OK") throw new Error("Catalog publish failed.");
assert.equal(published.value.available, true);

const found = await lookup.findProductBySlug("daily-vlog-script");
assert.equal(found.status, "FOUND");
if (found.status !== "FOUND") throw new Error("Catalog lookup failed.");
assert.equal(found.value.kind, "SCRIPT");

const editions = await lookup.listEditions(script.value.id);
assert.equal(editions.status, "FOUND");
if (editions.status !== "FOUND") throw new Error("Catalog edition listing failed.");
assert.equal(editions.values.length, 1);
assert.equal(editions.values[0]?.id, edition.value.id);

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `UPDATE "CatalogProduct"
        SET "minimumAcceptedVersion" = '1.0.0',
            "maximumAcceptedVersion" = '2.5.0'
      WHERE "id" = $1`,
    [script.value.id],
  );
  await client.query(
    `INSERT INTO "CatalogProductVersion" ("id", "productId", "version", "lifecycle", "active")
     VALUES
       ('version-active-draft', $1, '2.0.0', 'DRAFT', TRUE),
       ('version-inactive-stable', $1, '2.1.0', 'STABLE', FALSE)`,
    [script.value.id],
  );
} finally {
  await client.end();
}

const archived = await management.archiveProduct(script.value.id);
assert.equal(archived.status, "OK");

const activeDraft = await licensingFacts.findForCommercialLicensing({
  catalogProductId: script.value.id,
  requestedVersion: "2.0.0",
});
assert.equal(activeDraft.status, "FOUND");
if (activeDraft.status !== "FOUND") throw new Error("Catalog licensing facts lookup failed.");
assert.equal(activeDraft.value.externalProductId, "bke-daily-vlog-script");
assert.equal(activeDraft.value.minimumAcceptedVersion, "1.0.0");
assert.equal(activeDraft.value.maximumAcceptedVersion, "2.5.0");
assert.equal(activeDraft.value.versionEligible, true);

const inactiveStable = await licensingFacts.findForCommercialLicensing({
  catalogProductId: script.value.id,
  requestedVersion: "2.1.0",
});
assert.equal(inactiveStable.status, "FOUND");
if (inactiveStable.status !== "FOUND") throw new Error("Catalog inactive-version facts lookup failed.");
assert.equal(inactiveStable.value.versionEligible, false);

const missingVersion = await licensingFacts.findForCommercialLicensing({
  catalogProductId: script.value.id,
  requestedVersion: "9.9.9",
});
assert.equal(missingVersion.status, "FOUND");
if (missingVersion.status !== "FOUND") throw new Error("Catalog missing-version facts lookup failed.");
assert.equal(missingVersion.value.versionEligible, false);

const missingProduct = await licensingFacts.findForCommercialLicensing({
  catalogProductId: "missing-product",
  requestedVersion: "2.0.0",
});
assert.equal(missingProduct.status, "NOT_FOUND");

const asset = await management.createProduct({
  slug: "motion-template-pack",
  productId: "bke-motion-template-pack",
  name: "Motion Template Pack",
  summary: "Digital motion templates",
  description: "Catalog certification digital asset product",
  kind: "DIGITAL_ASSET",
});
assert.equal(asset.status, "OK");

console.log("Catalog PostgreSQL certification GREEN: catalog kinds and V1 commercial licensing software-version facts are preserved.");
