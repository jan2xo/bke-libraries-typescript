export const CATALOG_LOOKUP_CAPABILITY_ID = "bke.catalog.lookup.v1" as const;
export const CATALOG_MANAGEMENT_CAPABILITY_ID = "bke.catalog.management.v1" as const;

export const CATALOG_PRODUCT_KINDS = [
  "SOFTWARE",
  "SAAS",
  "HYBRID",
  "SCRIPT",
  "DIGITAL_ASSET",
] as const;

export type CatalogProductKind = (typeof CATALOG_PRODUCT_KINDS)[number];
export type CatalogUpdatePolicy = "LIFETIME" | "ACTIVE_TERM" | "MAJOR_VERSION";

export interface CatalogProductSnapshot {
  readonly id: string;
  readonly slug: string;
  readonly productId: string | null;
  readonly name: string;
  readonly summary: string;
  readonly description: string;
  readonly kind: CatalogProductKind;
  readonly category: string;
  readonly featured: boolean;
  readonly imageKey: string | null;
  readonly tags: readonly string[];
  readonly active: boolean;
  readonly publishedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly available: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CatalogEditionSnapshot {
  readonly id: string;
  readonly productId: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly features: unknown;
  readonly maxUsers: number;
  readonly maxDevicesPerUser: number;
  readonly updatePolicy: CatalogUpdatePolicy;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type CatalogLookupResult<T> =
  | { readonly status: "FOUND"; readonly value: T }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface CatalogLookupCapability {
  findProductById(id: string): Promise<CatalogLookupResult<CatalogProductSnapshot>>;
  findProductBySlug(slug: string): Promise<CatalogLookupResult<CatalogProductSnapshot>>;
  findEditionById(id: string): Promise<CatalogLookupResult<CatalogEditionSnapshot>>;
  listEditions(productId: string): Promise<
    | { readonly status: "FOUND"; readonly values: readonly CatalogEditionSnapshot[] }
    | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" }
  >;
}

export interface CatalogCreateProductInput {
  readonly slug: string;
  readonly productId?: string | null;
  readonly name: string;
  readonly summary: string;
  readonly description: string;
  readonly kind: CatalogProductKind;
  readonly category?: string;
  readonly featured?: boolean;
  readonly imageKey?: string | null;
  readonly tags?: readonly string[];
}

export interface CatalogUpdateProductInput {
  readonly id: string;
  readonly slug?: string;
  readonly productId?: string | null;
  readonly name?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly kind?: CatalogProductKind;
  readonly category?: string;
  readonly featured?: boolean;
  readonly imageKey?: string | null;
  readonly tags?: readonly string[];
}

export interface CatalogCreateEditionInput {
  readonly productId: string;
  readonly slug: string;
  readonly name: string;
  readonly description?: string | null;
  readonly features?: unknown;
  readonly maxUsers?: number;
  readonly maxDevicesPerUser?: number;
  readonly updatePolicy?: CatalogUpdatePolicy;
  readonly sortOrder?: number;
}

export interface CatalogUpdateEditionInput {
  readonly id: string;
  readonly slug?: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly features?: unknown;
  readonly maxUsers?: number;
  readonly maxDevicesPerUser?: number;
  readonly updatePolicy?: CatalogUpdatePolicy;
  readonly sortOrder?: number;
}

export type CatalogMutationResult<T> =
  | { readonly status: "OK"; readonly value: T }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "REJECTED"; readonly code: "CONFLICT" | "PRODUCT_NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface CatalogManagementCapability {
  createProduct(input: CatalogCreateProductInput): Promise<CatalogMutationResult<CatalogProductSnapshot>>;
  updateProduct(input: CatalogUpdateProductInput): Promise<CatalogMutationResult<CatalogProductSnapshot>>;
  publishProduct(id: string): Promise<CatalogMutationResult<CatalogProductSnapshot>>;
  archiveProduct(id: string): Promise<CatalogMutationResult<CatalogProductSnapshot>>;
  createEdition(input: CatalogCreateEditionInput): Promise<CatalogMutationResult<CatalogEditionSnapshot>>;
  updateEdition(input: CatalogUpdateEditionInput): Promise<CatalogMutationResult<CatalogEditionSnapshot>>;
  setEditionActive(id: string, active: boolean): Promise<CatalogMutationResult<CatalogEditionSnapshot>>;
}
