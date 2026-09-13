import type {
  CatalogProductDeletionDecisionErrorCode,
  CatalogProductDeletionEligibility,
  CatalogProductDeletionFinalizationPlan,
  CatalogProductDeletionRequestPlan,
  CatalogProductDeletionSnapshot,
  CatalogStorageCleanupStatus,
} from "../contracts/product-deletion-policy.contract";

export class CatalogProductDeletionDecisionError extends Error {
  constructor(
    public readonly code: CatalogProductDeletionDecisionErrorCode,
    public readonly eligibility?: CatalogProductDeletionEligibility,
  ) {
    super(code);
  }
}

export function evaluateCatalogProductDeletionEligibility(
  snapshot: CatalogProductDeletionSnapshot,
): CatalogProductDeletionEligibility {
  if (!snapshot.productExists) {
    return {
      productExists: false,
      productId: snapshot.productId,
      productName: null,
      productSlug: null,
      isArchived: false,
      canDelete: false,
      reason: "NOT_FOUND",
      blockingDependencies: snapshot.blockingDependencies,
      removableResources: snapshot.removableResources,
    };
  }

  const hasBlockers = Object.values(snapshot.blockingDependencies).some((count) => count > 0);
  const reason = !snapshot.isArchived
    ? "PRODUCT_NOT_ARCHIVED"
    : hasBlockers
      ? "HISTORICAL_DEPENDENCIES"
      : "ELIGIBLE";

  return {
    productExists: true,
    productId: snapshot.productId,
    productName: snapshot.productName,
    productSlug: snapshot.productSlug,
    isArchived: snapshot.isArchived,
    canDelete: reason === "ELIGIBLE",
    reason,
    blockingDependencies: snapshot.blockingDependencies,
    removableResources: snapshot.removableResources,
  };
}

export function authorizeCatalogProductDeletionRequest(input: Readonly<{
  snapshot: CatalogProductDeletionSnapshot;
  confirmationName: string;
}>): CatalogProductDeletionEligibility {
  const eligibility = evaluateCatalogProductDeletionEligibility(input.snapshot);
  if (!eligibility.productExists) {
    throw new CatalogProductDeletionDecisionError("NOT_FOUND", eligibility);
  }
  if (input.confirmationName !== eligibility.productName || !eligibility.canDelete) {
    throw new CatalogProductDeletionDecisionError("PRODUCT_DELETE_BLOCKED", eligibility);
  }
  return eligibility;
}

export function planCatalogProductDeletionRequest(input: Readonly<{
  snapshot: CatalogProductDeletionSnapshot;
  confirmationName: string;
  existingDeletionRequestedAt: Date | null;
  now: Date;
}>): CatalogProductDeletionRequestPlan {
  const eligibility = authorizeCatalogProductDeletionRequest({
    snapshot: input.snapshot,
    confirmationName: input.confirmationName,
  });
  const deletionRequestedAt = input.existingDeletionRequestedAt ?? input.now;
  return {
    eligibility,
    productUpdate: {
      deletionRequestedAt,
      active: false,
    },
    queueStorageCleanup: true,
    auditAction: "PRODUCT_DELETION_REQUESTED",
  };
}

export function authorizeCatalogProductDeletionFinalization(input: Readonly<{
  snapshot: CatalogProductDeletionSnapshot;
  cleanupStatuses: readonly CatalogStorageCleanupStatus[];
}>): CatalogProductDeletionEligibility {
  if (!input.snapshot.productExists) {
    throw new CatalogProductDeletionDecisionError("NOT_FOUND");
  }
  if (!input.snapshot.deletionRequested) {
    throw new CatalogProductDeletionDecisionError("PRODUCT_DELETION_NOT_READY");
  }
  if (input.cleanupStatuses.some((status) => status === "FAILED")) {
    throw new CatalogProductDeletionDecisionError("STORAGE_CLEANUP_FAILED");
  }
  if (input.cleanupStatuses.some((status) => status !== "SUCCEEDED")) {
    throw new CatalogProductDeletionDecisionError("STORAGE_CLEANUP_PENDING");
  }

  const eligibility = evaluateCatalogProductDeletionEligibility(input.snapshot);
  if (!eligibility.canDelete) {
    throw new CatalogProductDeletionDecisionError("PRODUCT_DELETE_BLOCKED", eligibility);
  }
  return eligibility;
}

export function planCatalogProductDeletionFinalization(input: Readonly<{
  snapshot: CatalogProductDeletionSnapshot;
  cleanupStatuses: readonly CatalogStorageCleanupStatus[];
}>): CatalogProductDeletionFinalizationPlan {
  const eligibility = authorizeCatalogProductDeletionFinalization(input);
  return {
    eligibility,
    deleteCatalogResources: true,
    auditAction: "PRODUCT_DELETION_FINALIZED",
  };
}
