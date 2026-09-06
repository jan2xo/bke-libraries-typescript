import { describe, expect, it } from "vitest";
import type { CatalogLicensingVersionFactsSnapshot } from "../contracts/catalog.contract";
import {
  createCatalogLicensingVersionFactsCapability,
  isExactActiveProductVersionEligible,
  type CatalogLicensingVersionFactsRepository,
} from "../logic/licensing-version-facts";

function repository(value: CatalogLicensingVersionFactsSnapshot | null): CatalogLicensingVersionFactsRepository {
  return { async findLicensingVersionFacts() { return value; } };
}

describe("catalog licensing version facts", () => {
  it("matches the V1 exact-version plus active predicate and ignores release lifecycle", () => {
    const versions = [
      { version: "1.0.0", active: true, lifecycle: "DRAFT" },
      { version: "2.0.0", active: false, lifecycle: "STABLE" },
      { version: "3.0.0", active: true, lifecycle: "ARCHIVED" },
    ];
    expect(isExactActiveProductVersionEligible(versions, "1.0.0")).toBe(true);
    expect(isExactActiveProductVersionEligible(versions, "2.0.0")).toBe(false);
    expect(isExactActiveProductVersionEligible(versions, "3.0.0")).toBe(true);
    expect(isExactActiveProductVersionEligible(versions, "9.9.9")).toBe(false);
  });

  it("returns Catalog-owned product identity, accepted bounds, and active exact-version eligibility", async () => {
    const facts: CatalogLicensingVersionFactsSnapshot = {
      catalogProductId: "product-db-id",
      externalProductId: "bke-air-stack",
      minimumAcceptedVersion: "1.0.0",
      maximumAcceptedVersion: "2.5.0",
      requestedVersion: "2.0.0",
      versionEligible: true,
    };
    const capability = createCatalogLicensingVersionFactsCapability(repository(facts));
    await expect(capability.findForCommercialLicensing({
      catalogProductId: "product-db-id",
      requestedVersion: "2.0.0",
    })).resolves.toEqual({ status: "FOUND", value: facts });
  });

  it("keeps requested version exact instead of applying Licensing semver policy", async () => {
    let seen = "";
    const capability = createCatalogLicensingVersionFactsCapability({
      async findLicensingVersionFacts(_productId, requestedVersion) {
        seen = requestedVersion;
        return null;
      },
    });
    await capability.findForCommercialLicensing({
      catalogProductId: "product-db-id",
      requestedVersion: " 1.0.0 ",
    });
    expect(seen).toBe(" 1.0.0 ");
  });

  it("fails closed on invalid owner key or persistence failure", async () => {
    const invalid = createCatalogLicensingVersionFactsCapability(repository(null));
    await expect(invalid.findForCommercialLicensing({ catalogProductId: " ", requestedVersion: "1.0.0" }))
      .resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });

    const failed = createCatalogLicensingVersionFactsCapability({
      async findLicensingVersionFacts() { throw new Error("database unavailable"); },
    });
    await expect(failed.findForCommercialLicensing({ catalogProductId: "p1", requestedVersion: "1.0.0" }))
      .resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
