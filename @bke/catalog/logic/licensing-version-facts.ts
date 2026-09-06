import type {
  CatalogLicensingVersionFactsCapability,
  CatalogLicensingVersionFactsSnapshot,
  CatalogLookupResult,
} from "../contracts/catalog.contract";

export interface CatalogLicensingVersionFactsRepository {
  findLicensingVersionFacts(
    catalogProductId: string,
    requestedVersion: string,
  ): Promise<CatalogLicensingVersionFactsSnapshot | null>;
}

export function isExactActiveProductVersionEligible(
  versions: readonly { readonly version: string; readonly active: boolean }[],
  requestedVersion: string,
): boolean {
  return versions.some((candidate) => candidate.version === requestedVersion && candidate.active);
}

function persistenceFailure(): CatalogLookupResult<CatalogLicensingVersionFactsSnapshot> {
  return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
}

export function createCatalogLicensingVersionFactsCapability(
  repository: CatalogLicensingVersionFactsRepository,
): CatalogLicensingVersionFactsCapability {
  return Object.freeze({
    async findForCommercialLicensing(input) {
      const catalogProductId = input.catalogProductId.trim();
      if (!catalogProductId || input.requestedVersion.length === 0) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }
      try {
        const value = await repository.findLicensingVersionFacts(
          catalogProductId,
          input.requestedVersion,
        );
        return value ? { status: "FOUND", value } : { status: "NOT_FOUND" };
      } catch {
        return persistenceFailure();
      }
    },
  });
}
