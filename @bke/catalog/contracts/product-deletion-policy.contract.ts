export const CATALOG_PRODUCT_DELETION_POLICY_CAPABILITY_ID = "catalog.product-deletion-policy.v1" as const;

export type CatalogProductDeletionDependencies = Readonly<{
  carts: number;
  orderItems: number;
  orders: number;
  invoices: number;
  payments: number;
  paymentAttempts: number;
  subscriptions: number;
  trials: number;
  licenses: number;
  assignments: number;
  activations: number;
  downloadGrants: number;
  downloads: number;
  licenseEvents: number;
  offers: number;
  offerRedemptions: number;
}>;

export type CatalogProductDeletionResources = Readonly<{
  editions: number;
  purchasePlans: number;
  versions: number;
  artifacts: number;
  prices: number;
  policies: number;
  tags: number;
  images: number;
  storageObjects: number;
}>;

export type CatalogProductDeletionSnapshot = Readonly<{
  productExists: boolean;
  productId: string;
  productName: string | null;
  productSlug: string | null;
  isArchived: boolean;
  deletionRequested: boolean;
  blockingDependencies: CatalogProductDeletionDependencies;
  removableResources: CatalogProductDeletionResources;
}>;

export type CatalogProductDeletionEligibilityReason =
  | "NOT_FOUND"
  | "PRODUCT_NOT_ARCHIVED"
  | "HISTORICAL_DEPENDENCIES"
  | "ELIGIBLE";

export type CatalogProductDeletionEligibility = Readonly<{
  productExists: boolean;
  productId: string;
  productName: string | null;
  productSlug: string | null;
  isArchived: boolean;
  canDelete: boolean;
  reason: CatalogProductDeletionEligibilityReason;
  blockingDependencies: CatalogProductDeletionDependencies;
  removableResources: CatalogProductDeletionResources;
}>;

export type CatalogStorageCleanupStatus = "PENDING" | "PROCESSING" | "RETRYING" | "SUCCEEDED" | "FAILED";

export type CatalogProductDeletionDecisionErrorCode =
  | "NOT_FOUND"
  | "PRODUCT_DELETE_BLOCKED"
  | "PRODUCT_DELETION_NOT_READY"
  | "STORAGE_CLEANUP_PENDING"
  | "STORAGE_CLEANUP_FAILED";
