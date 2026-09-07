import { Client } from "pg";
import type { CatalogLicensingVersionFactsSnapshot } from "../../contracts/catalog.contract";
import type { CatalogLicensingVersionFactsRepository } from "../../logic/licensing-version-facts";

type LegacyLicensingVersionFactsRow = {
  catalogProductId: string;
  externalProductId: string | null;
  minimumAcceptedVersion: string | null;
  maximumAcceptedVersion: string | null;
  requestedVersion: string;
  versionEligible: boolean;
};

/**
 * Transitional Catalog-owned persistence adapter for hosts that still keep
 * Catalog facts in the pre-extraction Product/ProductVersion tables.
 *
 * It contains no licensing decision policy: it only projects Catalog-owned
 * facts into the canonical CatalogLicensingVersionFactsRepository contract.
 */
export function createLegacySchemaCatalogLicensingVersionFactsRepository(
  connectionString: string,
): CatalogLicensingVersionFactsRepository {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Catalog PostgreSQL connection string is required.");

  return Object.freeze({
    async findLicensingVersionFacts(
      catalogProductId: string,
      requestedVersion: string,
    ): Promise<CatalogLicensingVersionFactsSnapshot | null> {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        const result = await client.query<LegacyLicensingVersionFactsRow>(
          `SELECT
             p."id" AS "catalogProductId",
             p."productId" AS "externalProductId",
             p."minimumAcceptedVersion",
             p."maximumAcceptedVersion",
             $2::text AS "requestedVersion",
             EXISTS (
               SELECT 1
                 FROM "ProductVersion" v
                WHERE v."productId" = p."id"
                  AND v."version" = $2
                  AND v."active" = TRUE
             ) AS "versionEligible"
           FROM "Product" p
          WHERE p."id" = $1`,
          [catalogProductId, requestedVersion],
        );
        if (result.rowCount !== 1) return null;
        const row = result.rows[0]!;
        return Object.freeze({
          catalogProductId: row.catalogProductId,
          externalProductId: row.externalProductId,
          minimumAcceptedVersion: row.minimumAcceptedVersion,
          maximumAcceptedVersion: row.maximumAcceptedVersion,
          requestedVersion: row.requestedVersion,
          versionEligible: row.versionEligible,
        } satisfies CatalogLicensingVersionFactsSnapshot);
      } finally {
        await client.end();
      }
    },
  });
}
