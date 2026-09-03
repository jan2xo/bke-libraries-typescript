import { randomUUID } from "node:crypto";
import {
  CATALOG_PRODUCT_KINDS,
  type CatalogCreateEditionInput,
  type CatalogCreateProductInput,
  type CatalogEditionSnapshot,
  type CatalogLookupCapability,
  type CatalogLookupResult,
  type CatalogManagementCapability,
  type CatalogMutationResult,
  type CatalogProductKind,
  type CatalogProductSnapshot,
  type CatalogUpdateEditionInput,
  type CatalogUpdatePolicy,
  type CatalogUpdateProductInput,
} from "../contracts/catalog.contract";
import type { CatalogRepository } from "./catalog-repository";

const kindSet = new Set<string>(CATALOG_PRODUCT_KINDS);
const updatePolicies = new Set<CatalogUpdatePolicy>(["LIFETIME", "ACTIVE_TERM", "MAJOR_VERSION"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const productIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/;

function cleanText(value: string, max: number): string | null {
  const clean = value.trim();
  return clean && clean.length <= max ? clean : null;
}

function cleanSlug(value: string): string | null {
  const clean = value.trim().toLowerCase();
  return clean.length <= 100 && slugPattern.test(clean) ? clean : null;
}

function cleanProductId(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const clean = value.trim();
  return productIdPattern.test(clean) ? clean : undefined;
}

function cleanTags(values: readonly string[] | undefined): readonly string[] | undefined {
  if (values === undefined) return undefined;
  const tags = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (tags.length > 50 || tags.some((value) => value.length > 80)) return undefined;
  return tags;
}

function validPositiveInteger(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 1 && value <= 1_000_000);
}

function validSortOrder(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= -1_000_000 && value <= 1_000_000);
}

function pgCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

function lookupFailure<T>(): CatalogLookupResult<T> {
  return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
}

function mutationFailure<T>(error: unknown): CatalogMutationResult<T> {
  const code = pgCode(error);
  if (code === "23505") return { status: "REJECTED", code: "CONFLICT" };
  if (code === "23503") return { status: "REJECTED", code: "PRODUCT_NOT_FOUND" };
  return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
}

function normalizeCreateProduct(input: CatalogCreateProductInput): CatalogCreateProductInput | null {
  const slug = cleanSlug(input.slug);
  const name = cleanText(input.name, 160);
  const summary = cleanText(input.summary, 500);
  const description = cleanText(input.description, 20_000);
  const category = cleanText(input.category ?? "General", 120);
  const productId = cleanProductId(input.productId);
  const tags = cleanTags(input.tags ?? []);
  if (!slug || !name || !summary || !description || !category || tags === undefined) return null;
  if (input.productId !== undefined && productId === undefined) return null;
  if (!kindSet.has(input.kind)) return null;
  return {
    ...input,
    slug,
    name,
    summary,
    description,
    category,
    productId: productId ?? null,
    tags,
  };
}

function normalizeUpdateProduct(input: CatalogUpdateProductInput): CatalogUpdateProductInput | null {
  if (!input.id.trim()) return null;
  const normalized: CatalogUpdateProductInput = { id: input.id.trim() };
  if (input.slug !== undefined) {
    const slug = cleanSlug(input.slug);
    if (!slug) return null;
    Object.assign(normalized, { slug });
  }
  if (input.productId !== undefined) {
    const productId = cleanProductId(input.productId);
    if (productId === undefined) return null;
    Object.assign(normalized, { productId });
  }
  for (const [key, max] of [["name", 160], ["summary", 500], ["description", 20_000], ["category", 120]] as const) {
    const value = input[key];
    if (value !== undefined) {
      const clean = cleanText(value, max);
      if (!clean) return null;
      Object.assign(normalized, { [key]: clean });
    }
  }
  if (input.kind !== undefined) {
    if (!kindSet.has(input.kind)) return null;
    Object.assign(normalized, { kind: input.kind as CatalogProductKind });
  }
  if (input.featured !== undefined) Object.assign(normalized, { featured: input.featured });
  if (input.imageKey !== undefined) Object.assign(normalized, { imageKey: input.imageKey?.trim() || null });
  if (input.tags !== undefined) {
    const tags = cleanTags(input.tags);
    if (tags === undefined) return null;
    Object.assign(normalized, { tags });
  }
  return normalized;
}

function normalizeCreateEdition(input: CatalogCreateEditionInput): CatalogCreateEditionInput | null {
  const productId = input.productId.trim();
  const slug = cleanSlug(input.slug);
  const name = cleanText(input.name, 160);
  const description = input.description == null ? null : cleanText(input.description, 20_000);
  const updatePolicy = input.updatePolicy ?? "LIFETIME";
  if (!productId || !slug || !name || (input.description != null && !description)) return null;
  if (!updatePolicies.has(updatePolicy)) return null;
  if (!validPositiveInteger(input.maxUsers) || !validPositiveInteger(input.maxDevicesPerUser) || !validSortOrder(input.sortOrder)) return null;
  return {
    ...input,
    productId,
    slug,
    name,
    description,
    updatePolicy,
    maxUsers: input.maxUsers ?? 1,
    maxDevicesPerUser: input.maxDevicesPerUser ?? 1,
    sortOrder: input.sortOrder ?? 0,
  };
}

function normalizeUpdateEdition(input: CatalogUpdateEditionInput): CatalogUpdateEditionInput | null {
  if (!input.id.trim()) return null;
  const normalized: CatalogUpdateEditionInput = { id: input.id.trim() };
  if (input.slug !== undefined) {
    const slug = cleanSlug(input.slug);
    if (!slug) return null;
    Object.assign(normalized, { slug });
  }
  if (input.name !== undefined) {
    const name = cleanText(input.name, 160);
    if (!name) return null;
    Object.assign(normalized, { name });
  }
  if (input.description !== undefined) {
    const description = input.description === null ? null : cleanText(input.description, 20_000);
    if (input.description !== null && !description) return null;
    Object.assign(normalized, { description });
  }
  if (input.features !== undefined) Object.assign(normalized, { features: input.features });
  if (!validPositiveInteger(input.maxUsers) || !validPositiveInteger(input.maxDevicesPerUser) || !validSortOrder(input.sortOrder)) return null;
  if (input.maxUsers !== undefined) Object.assign(normalized, { maxUsers: input.maxUsers });
  if (input.maxDevicesPerUser !== undefined) Object.assign(normalized, { maxDevicesPerUser: input.maxDevicesPerUser });
  if (input.sortOrder !== undefined) Object.assign(normalized, { sortOrder: input.sortOrder });
  if (input.updatePolicy !== undefined) {
    if (!updatePolicies.has(input.updatePolicy)) return null;
    Object.assign(normalized, { updatePolicy: input.updatePolicy });
  }
  return normalized;
}

export function createCatalogLookupCapability(repository: CatalogRepository): CatalogLookupCapability {
  const capability: CatalogLookupCapability = {
    async findProductById(id) {
      const clean = id.trim();
      if (!clean) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const value = await repository.findProductById(clean);
        return value ? { status: "FOUND", value } : { status: "NOT_FOUND" };
      } catch {
        return lookupFailure<CatalogProductSnapshot>();
      }
    },
    async findProductBySlug(slug) {
      const clean = cleanSlug(slug);
      if (!clean) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const value = await repository.findProductBySlug(clean);
        return value ? { status: "FOUND", value } : { status: "NOT_FOUND" };
      } catch {
        return lookupFailure<CatalogProductSnapshot>();
      }
    },
    async findEditionById(id) {
      const clean = id.trim();
      if (!clean) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const value = await repository.findEditionById(clean);
        return value ? { status: "FOUND", value } : { status: "NOT_FOUND" };
      } catch {
        return lookupFailure<CatalogEditionSnapshot>();
      }
    },
    async listEditions(productId) {
      const clean = productId.trim();
      if (!clean) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        return { status: "FOUND", values: await repository.listEditions(clean) };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  };
  return Object.freeze(capability);
}

export function createCatalogManagementCapability(repository: CatalogRepository): CatalogManagementCapability {
  const capability: CatalogManagementCapability = {
    async createProduct(input) {
      const normalized = normalizeCreateProduct(input);
      if (!normalized) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        return { status: "OK", value: await repository.createProduct(randomUUID(), normalized) };
      } catch (error) {
        return mutationFailure<CatalogProductSnapshot>(error);
      }
    },
    async updateProduct(input) {
      const normalized = normalizeUpdateProduct(input);
      if (!normalized) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const value = await repository.updateProduct(normalized);
        return value ? { status: "OK", value } : { status: "NOT_FOUND" };
      } catch (error) {
        return mutationFailure<CatalogProductSnapshot>(error);
      }
    },
    async publishProduct(id) {
      if (!id.trim()) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const value = await repository.publishProduct(id.trim());
        return value ? { status: "OK", value } : { status: "NOT_FOUND" };
      } catch (error) {
        return mutationFailure<CatalogProductSnapshot>(error);
      }
    },
    async archiveProduct(id) {
      if (!id.trim()) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const value = await repository.archiveProduct(id.trim());
        return value ? { status: "OK", value } : { status: "NOT_FOUND" };
      } catch (error) {
        return mutationFailure<CatalogProductSnapshot>(error);
      }
    },
    async createEdition(input) {
      const normalized = normalizeCreateEdition(input);
      if (!normalized) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        return { status: "OK", value: await repository.createEdition(randomUUID(), normalized) };
      } catch (error) {
        return mutationFailure<CatalogEditionSnapshot>(error);
      }
    },
    async updateEdition(input) {
      const normalized = normalizeUpdateEdition(input);
      if (!normalized) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const value = await repository.updateEdition(normalized);
        return value ? { status: "OK", value } : { status: "NOT_FOUND" };
      } catch (error) {
        return mutationFailure<CatalogEditionSnapshot>(error);
      }
    },
    async setEditionActive(id, active) {
      if (!id.trim()) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const value = await repository.setEditionActive(id.trim(), active);
        return value ? { status: "OK", value } : { status: "NOT_FOUND" };
      } catch (error) {
        return mutationFailure<CatalogEditionSnapshot>(error);
      }
    },
  };
  return Object.freeze(capability);
}
