import { Client } from "pg";
import {
  CATALOG_PRODUCT_KINDS,
  type CatalogCreateEditionInput,
  type CatalogCreateProductInput,
  type CatalogEditionSnapshot,
  type CatalogProductKind,
  type CatalogProductSnapshot,
  type CatalogUpdateEditionInput,
  type CatalogUpdatePolicy,
  type CatalogUpdateProductInput,
} from "../../contracts/catalog.contract";
import type { CatalogRepository } from "../../logic/catalog-repository";

type ProductRow = {
  id: string;
  slug: string;
  productId: string | null;
  name: string;
  summary: string;
  description: string;
  kind: string;
  category: string;
  featured: boolean;
  imageKey: string | null;
  tags: string[];
  active: boolean;
  publishedAt: Date | string | null;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type EditionRow = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  description: string | null;
  features: unknown;
  maxUsers: number;
  maxDevicesPerUser: number;
  updatePolicy: string;
  active: boolean;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const productKinds = new Set<string>(CATALOG_PRODUCT_KINDS);
const updatePolicies = new Set<string>(["LIFETIME", "ACTIVE_TERM", "MAJOR_VERSION"]);

function date(value: Date | string | null): Date | null {
  return value === null ? null : new Date(value);
}

function product(row: ProductRow): CatalogProductSnapshot {
  if (!productKinds.has(row.kind)) throw new Error(`Unknown catalog product kind: ${row.kind}`);
  const publishedAt = date(row.publishedAt);
  const archivedAt = date(row.archivedAt);
  return Object.freeze({
    ...row,
    kind: row.kind as CatalogProductKind,
    tags: Object.freeze([...row.tags]),
    publishedAt,
    archivedAt,
    available: row.active && publishedAt !== null && archivedAt === null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  });
}

function edition(row: EditionRow): CatalogEditionSnapshot {
  if (!updatePolicies.has(row.updatePolicy)) {
    throw new Error(`Unknown catalog update policy: ${row.updatePolicy}`);
  }
  return Object.freeze({
    ...row,
    maxUsers: Number(row.maxUsers),
    maxDevicesPerUser: Number(row.maxDevicesPerUser),
    sortOrder: Number(row.sortOrder),
    updatePolicy: row.updatePolicy as CatalogUpdatePolicy,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  });
}

export function createPostgresCatalogRepository(connectionString: string): CatalogRepository {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Catalog PostgreSQL connection string is required.");

  async function withClient<T>(operation: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: normalized });
    await client.connect();
    try {
      return await operation(client);
    } finally {
      await client.end();
    }
  }

  const repository: CatalogRepository = {
    async findProductById(id) {
      return withClient(async (client) => {
        const result = await client.query<ProductRow>(`SELECT * FROM "CatalogProduct" WHERE "id" = $1`, [id]);
        return result.rowCount === 1 ? product(result.rows[0]!) : null;
      });
    },

    async findProductBySlug(slug) {
      return withClient(async (client) => {
        const result = await client.query<ProductRow>(`SELECT * FROM "CatalogProduct" WHERE "slug" = $1`, [slug]);
        return result.rowCount === 1 ? product(result.rows[0]!) : null;
      });
    },

    async findEditionById(id) {
      return withClient(async (client) => {
        const result = await client.query<EditionRow>(`SELECT * FROM "CatalogEdition" WHERE "id" = $1`, [id]);
        return result.rowCount === 1 ? edition(result.rows[0]!) : null;
      });
    },

    async listEditions(productId) {
      return withClient(async (client) => {
        const result = await client.query<EditionRow>(
          `SELECT * FROM "CatalogEdition" WHERE "productId" = $1 ORDER BY "sortOrder" ASC, "name" ASC`,
          [productId],
        );
        return Object.freeze(result.rows.map(edition));
      });
    },

    async createProduct(id, input: CatalogCreateProductInput) {
      return withClient(async (client) => {
        const result = await client.query<ProductRow>(
          `INSERT INTO "CatalogProduct" (
             "id", "slug", "productId", "name", "summary", "description", "kind", "category",
             "featured", "imageKey", "tags", "active"
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE)
           RETURNING *`,
          [
            id,
            input.slug,
            input.productId ?? null,
            input.name,
            input.summary,
            input.description,
            input.kind,
            input.category ?? "General",
            input.featured ?? false,
            input.imageKey ?? null,
            input.tags ?? [],
          ],
        );
        return product(result.rows[0]!);
      });
    },

    async updateProduct(input: CatalogUpdateProductInput) {
      return withClient(async (client) => {
        const fields: string[] = [];
        const values: unknown[] = [input.id];
        const push = (column: string, value: unknown) => {
          values.push(value);
          fields.push(`"${column}" = $${values.length}`);
        };
        if (input.slug !== undefined) push("slug", input.slug);
        if (input.productId !== undefined) push("productId", input.productId);
        if (input.name !== undefined) push("name", input.name);
        if (input.summary !== undefined) push("summary", input.summary);
        if (input.description !== undefined) push("description", input.description);
        if (input.kind !== undefined) push("kind", input.kind);
        if (input.category !== undefined) push("category", input.category);
        if (input.featured !== undefined) push("featured", input.featured);
        if (input.imageKey !== undefined) push("imageKey", input.imageKey);
        if (input.tags !== undefined) push("tags", input.tags);
        if (fields.length === 0) return this.findProductById(input.id);
        fields.push(`"updatedAt" = CURRENT_TIMESTAMP`);
        const result = await client.query<ProductRow>(
          `UPDATE "CatalogProduct" SET ${fields.join(", ")} WHERE "id" = $1 RETURNING *`,
          values,
        );
        return result.rowCount === 1 ? product(result.rows[0]!) : null;
      });
    },

    async publishProduct(id) {
      return withClient(async (client) => {
        const result = await client.query<ProductRow>(
          `UPDATE "CatalogProduct"
              SET "active" = TRUE,
                  "publishedAt" = COALESCE("publishedAt", CURRENT_TIMESTAMP),
                  "archivedAt" = NULL,
                  "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = $1
            RETURNING *`,
          [id],
        );
        return result.rowCount === 1 ? product(result.rows[0]!) : null;
      });
    },

    async archiveProduct(id) {
      return withClient(async (client) => {
        const result = await client.query<ProductRow>(
          `UPDATE "CatalogProduct"
              SET "active" = FALSE,
                  "archivedAt" = CURRENT_TIMESTAMP,
                  "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = $1
            RETURNING *`,
          [id],
        );
        return result.rowCount === 1 ? product(result.rows[0]!) : null;
      });
    },

    async createEdition(id, input: CatalogCreateEditionInput) {
      return withClient(async (client) => {
        const result = await client.query<EditionRow>(
          `INSERT INTO "CatalogEdition" (
             "id", "productId", "slug", "name", "description", "features", "maxUsers",
             "maxDevicesPerUser", "updatePolicy", "active", "sortOrder"
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,TRUE,$10)
           RETURNING *`,
          [
            id,
            input.productId,
            input.slug,
            input.name,
            input.description ?? null,
            JSON.stringify(input.features ?? []),
            input.maxUsers ?? 1,
            input.maxDevicesPerUser ?? 1,
            input.updatePolicy ?? "LIFETIME",
            input.sortOrder ?? 0,
          ],
        );
        return edition(result.rows[0]!);
      });
    },

    async updateEdition(input: CatalogUpdateEditionInput) {
      return withClient(async (client) => {
        const fields: string[] = [];
        const values: unknown[] = [input.id];
        const push = (column: string, value: unknown, cast = "") => {
          values.push(value);
          fields.push(`"${column}" = $${values.length}${cast}`);
        };
        if (input.slug !== undefined) push("slug", input.slug);
        if (input.name !== undefined) push("name", input.name);
        if (input.description !== undefined) push("description", input.description);
        if (input.features !== undefined) push("features", JSON.stringify(input.features), "::jsonb");
        if (input.maxUsers !== undefined) push("maxUsers", input.maxUsers);
        if (input.maxDevicesPerUser !== undefined) push("maxDevicesPerUser", input.maxDevicesPerUser);
        if (input.updatePolicy !== undefined) push("updatePolicy", input.updatePolicy);
        if (input.sortOrder !== undefined) push("sortOrder", input.sortOrder);
        if (fields.length === 0) return this.findEditionById(input.id);
        fields.push(`"updatedAt" = CURRENT_TIMESTAMP`);
        const result = await client.query<EditionRow>(
          `UPDATE "CatalogEdition" SET ${fields.join(", ")} WHERE "id" = $1 RETURNING *`,
          values,
        );
        return result.rowCount === 1 ? edition(result.rows[0]!) : null;
      });
    },

    async setEditionActive(id, active) {
      return withClient(async (client) => {
        const result = await client.query<EditionRow>(
          `UPDATE "CatalogEdition"
              SET "active" = $2, "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = $1
            RETURNING *`,
          [id, active],
        );
        return result.rowCount === 1 ? edition(result.rows[0]!) : null;
      });
    },
  };
  return Object.freeze(repository);
}
