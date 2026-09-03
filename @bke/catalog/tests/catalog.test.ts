import { describe, expect, it } from "vitest";
import {
  CATALOG_LOOKUP_CAPABILITY_ID,
  CATALOG_MANAGEMENT_CAPABILITY_ID,
  CATALOG_PRODUCT_KINDS,
  type CatalogCreateEditionInput,
  type CatalogCreateProductInput,
  type CatalogEditionSnapshot,
  type CatalogProductSnapshot,
  type CatalogUpdateEditionInput,
  type CatalogUpdateProductInput,
} from "../contracts/catalog.contract";
import {
  createCatalogLookupCapability,
  createCatalogManagementCapability,
} from "../logic/catalog";
import type { CatalogRepository } from "../logic/catalog-repository";
import { catalogModuleManifest } from "../module.manifest";

function memoryRepository(): CatalogRepository {
  const products = new Map<string, CatalogProductSnapshot>();
  const editions = new Map<string, CatalogEditionSnapshot>();
  const now = () => new Date("2026-09-03T00:00:00.000Z");

  return {
    async findProductById(id) { return products.get(id) ?? null; },
    async findProductBySlug(slug) { return [...products.values()].find((value) => value.slug === slug) ?? null; },
    async findEditionById(id) { return editions.get(id) ?? null; },
    async listEditions(productId) { return [...editions.values()].filter((value) => value.productId === productId); },
    async createProduct(id: string, input: CatalogCreateProductInput) {
      if ([...products.values()].some((value) => value.slug === input.slug)) Object.assign(new Error("conflict"), { code: "23505" });
      const value: CatalogProductSnapshot = {
        id,
        slug: input.slug,
        productId: input.productId ?? null,
        name: input.name,
        summary: input.summary,
        description: input.description,
        kind: input.kind,
        category: input.category ?? "General",
        featured: input.featured ?? false,
        imageKey: input.imageKey ?? null,
        tags: input.tags ?? [],
        active: true,
        publishedAt: null,
        archivedAt: null,
        available: false,
        createdAt: now(),
        updatedAt: now(),
      };
      products.set(id, value);
      return value;
    },
    async updateProduct(input: CatalogUpdateProductInput) {
      const current = products.get(input.id);
      if (!current) return null;
      const value = { ...current, ...input, updatedAt: now() } as CatalogProductSnapshot;
      products.set(input.id, value);
      return value;
    },
    async publishProduct(id) {
      const current = products.get(id);
      if (!current) return null;
      const value = { ...current, active: true, publishedAt: now(), archivedAt: null, available: true, updatedAt: now() };
      products.set(id, value);
      return value;
    },
    async archiveProduct(id) {
      const current = products.get(id);
      if (!current) return null;
      const value = { ...current, active: false, archivedAt: now(), available: false, updatedAt: now() };
      products.set(id, value);
      return value;
    },
    async createEdition(id: string, input: CatalogCreateEditionInput) {
      if (!products.has(input.productId)) Object.assign(new Error("missing product"), { code: "23503" });
      const value: CatalogEditionSnapshot = {
        id,
        productId: input.productId,
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        features: input.features ?? [],
        maxUsers: input.maxUsers ?? 1,
        maxDevicesPerUser: input.maxDevicesPerUser ?? 1,
        updatePolicy: input.updatePolicy ?? "LIFETIME",
        active: true,
        sortOrder: input.sortOrder ?? 0,
        createdAt: now(),
        updatedAt: now(),
      };
      editions.set(id, value);
      return value;
    },
    async updateEdition(input: CatalogUpdateEditionInput) {
      const current = editions.get(input.id);
      if (!current) return null;
      const value = { ...current, ...input, updatedAt: now() } as CatalogEditionSnapshot;
      editions.set(input.id, value);
      return value;
    },
    async setEditionActive(id, active) {
      const current = editions.get(id);
      if (!current) return null;
      const value = { ...current, active, updatedAt: now() };
      editions.set(id, value);
      return value;
    },
  };
}

describe("catalog capability", () => {
  it("declares independent lookup and management capabilities", () => {
    expect(catalogModuleManifest.needs).toEqual([]);
    expect(catalogModuleManifest.provides).toEqual([
      CATALOG_LOOKUP_CAPABILITY_ID,
      CATALOG_MANAGEMENT_CAPABILITY_ID,
    ]);
  });

  it("supports software, SaaS, scripts and digital assets without product-type branching elsewhere", async () => {
    const repository = memoryRepository();
    const management = createCatalogManagementCapability(repository);
    const lookup = createCatalogLookupCapability(repository);

    for (const [index, kind] of CATALOG_PRODUCT_KINDS.entries()) {
      const created = await management.createProduct({
        slug: `product-${index}`,
        productId: `bke-${kind.toLowerCase().replace("_", "-")}`,
        name: `${kind} Product`,
        summary: `${kind} summary`,
        description: `${kind} description`,
        kind,
      });
      expect(created.status).toBe("OK");
      if (created.status !== "OK") continue;
      const published = await management.publishProduct(created.value.id);
      expect(published.status).toBe("OK");
      const found = await lookup.findProductBySlug(`product-${index}`);
      expect(found.status).toBe("FOUND");
      if (found.status === "FOUND") {
        expect(found.value.kind).toBe(kind);
        expect(found.value.available).toBe(true);
      }
    }
  });

  it("owns edition capability snapshots independently of Commerce", async () => {
    const repository = memoryRepository();
    const management = createCatalogManagementCapability(repository);
    const lookup = createCatalogLookupCapability(repository);
    const product = await management.createProduct({
      slug: "air-stack",
      productId: "bke-air-stack",
      name: "Air Stack",
      summary: "Broadcast automation",
      description: "Broadcast automation platform",
      kind: "SOFTWARE",
    });
    expect(product.status).toBe("OK");
    if (product.status !== "OK") return;
    const edition = await management.createEdition({
      productId: product.value.id,
      slug: "professional",
      name: "Professional",
      features: ["automation", "rendering"],
      maxUsers: 5,
      maxDevicesPerUser: 2,
      updatePolicy: "ACTIVE_TERM",
    });
    expect(edition.status).toBe("OK");
    if (edition.status !== "OK") return;
    const found = await lookup.findEditionById(edition.value.id);
    expect(found.status).toBe("FOUND");
    if (found.status === "FOUND") {
      expect(found.value.maxUsers).toBe(5);
      expect(found.value.maxDevicesPerUser).toBe(2);
      expect(found.value.updatePolicy).toBe("ACTIVE_TERM");
    }
  });
});
