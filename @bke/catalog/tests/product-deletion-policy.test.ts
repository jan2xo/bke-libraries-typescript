import { describe, expect, it } from "vitest";
import type { CatalogProductDeletionSnapshot } from "../contracts/product-deletion-policy.contract";
import {
  authorizeCatalogProductDeletionFinalization,
  authorizeCatalogProductDeletionRequest,
  evaluateCatalogProductDeletionEligibility,
} from "../logic/product-deletion-policy";

const emptyDependencies = {
  carts: 0,
  orderItems: 0,
  orders: 0,
  invoices: 0,
  payments: 0,
  paymentAttempts: 0,
  subscriptions: 0,
  trials: 0,
  licenses: 0,
  assignments: 0,
  activations: 0,
  downloadGrants: 0,
  downloads: 0,
  licenseEvents: 0,
  offers: 0,
  offerRedemptions: 0,
} as const;

const resources = {
  editions: 1,
  purchasePlans: 3,
  versions: 2,
  artifacts: 1,
  prices: 0,
  policies: 1,
  tags: 2,
  images: 1,
  storageObjects: 2,
} as const;

function snapshot(overrides: Partial<CatalogProductDeletionSnapshot> = {}): CatalogProductDeletionSnapshot {
  return {
    productExists: true,
    productId: "product-1",
    productName: "Air Stack",
    productSlug: "air-stack",
    isArchived: true,
    deletionRequested: false,
    blockingDependencies: emptyDependencies,
    removableResources: resources,
    ...overrides,
  };
}

describe("catalog product deletion policy", () => {
  it("requires an archived product", () => {
    expect(evaluateCatalogProductDeletionEligibility(snapshot({ isArchived: false }))).toMatchObject({
      canDelete: false,
      reason: "PRODUCT_NOT_ARCHIVED",
    });
  });

  it("blocks deletion when historical dependencies exist", () => {
    expect(evaluateCatalogProductDeletionEligibility(snapshot({
      blockingDependencies: { ...emptyDependencies, licenses: 1 },
    }))).toMatchObject({ canDelete: false, reason: "HISTORICAL_DEPENDENCIES" });
  });

  it("marks archived dependency-free products eligible", () => {
    expect(evaluateCatalogProductDeletionEligibility(snapshot())).toMatchObject({
      canDelete: true,
      reason: "ELIGIBLE",
      removableResources: resources,
    });
  });

  it("requires exact product-name confirmation for a deletion request", () => {
    expect(() => authorizeCatalogProductDeletionRequest({ snapshot: snapshot(), confirmationName: "air stack" }))
      .toThrow("PRODUCT_DELETE_BLOCKED");
    expect(authorizeCatalogProductDeletionRequest({ snapshot: snapshot(), confirmationName: "Air Stack" }).canDelete).toBe(true);
  });

  it("requires a prior deletion request before finalization", () => {
    expect(() => authorizeCatalogProductDeletionFinalization({ snapshot: snapshot(), cleanupStatuses: [] }))
      .toThrow("PRODUCT_DELETION_NOT_READY");
  });

  it("fails finalization on failed cleanup before pending cleanup", () => {
    const ready = snapshot({ deletionRequested: true });
    expect(() => authorizeCatalogProductDeletionFinalization({ snapshot: ready, cleanupStatuses: ["SUCCEEDED", "FAILED", "PENDING"] }))
      .toThrow("STORAGE_CLEANUP_FAILED");
  });

  it("holds finalization while any cleanup remains incomplete", () => {
    expect(() => authorizeCatalogProductDeletionFinalization({
      snapshot: snapshot({ deletionRequested: true }),
      cleanupStatuses: ["SUCCEEDED", "RETRYING"],
    })).toThrow("STORAGE_CLEANUP_PENDING");
  });

  it("allows finalization only after successful cleanup and fresh eligibility", () => {
    expect(authorizeCatalogProductDeletionFinalization({
      snapshot: snapshot({ deletionRequested: true }),
      cleanupStatuses: ["SUCCEEDED", "SUCCEEDED"],
    }).reason).toBe("ELIGIBLE");
  });
});
