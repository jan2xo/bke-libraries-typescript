import assert from "node:assert/strict";
import { createCatalogLookupCapability, createCatalogManagementCapability } from "../logic/catalog";
import { createPostgresCatalogRepository } from "../prisma/repositories/postgres-catalog-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Catalog PostgreSQL certification.");

const repository = createPostgresCatalogRepository(connectionString);
const management = createCatalogManagementCapability(repository);
const lookup = createCatalogLookupCapability(repository);

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

const asset = await management.createProduct({
  slug: "motion-template-pack",
  productId: "bke-motion-template-pack",
  name: "Motion Template Pack",
  summary: "Digital motion templates",
  description: "Catalog certification digital asset product",
  kind: "DIGITAL_ASSET",
});
assert.equal(asset.status, "OK");

console.log("Catalog PostgreSQL certification GREEN: SCRIPT and DIGITAL_ASSET are first-class catalog kinds.");
