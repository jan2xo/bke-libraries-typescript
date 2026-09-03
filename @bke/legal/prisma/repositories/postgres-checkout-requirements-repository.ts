import { Client } from "pg";
import type {
  LegalCheckoutRequirementSnapshot,
  LegalDocumentType,
} from "../../contracts/checkout-requirements.contract";
import type { LegalCheckoutRequirementsRepository } from "../../logic/checkout-requirements-repository";

function snapshot(row: Record<string, unknown>): LegalCheckoutRequirementSnapshot {
  return {
    documentId: String(row.documentId),
    documentType: String(row.documentType) as LegalDocumentType,
    title: String(row.title),
    slug: String(row.slug),
    documentVersionId: String(row.documentVersionId),
    version: String(row.version),
    slaVersion: String(row.slaVersion),
    renderedContentSha256: String(row.sha256),
    requiresReacceptance: Boolean(row.requiresReacceptance),
  };
}

export function createPostgresLegalCheckoutRequirementsRepository(
  connectionString: string,
): LegalCheckoutRequirementsRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) throw new Error("Legal PostgreSQL connection string is required.");

  return Object.freeze({
    async findCurrent(documentTypes: readonly LegalDocumentType[]) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query(
          `SELECT
             d."id" AS "documentId",
             d."documentType",
             d."title",
             d."slug",
             v."id" AS "documentVersionId",
             v."version",
             v."slaVersion",
             v."sha256",
             v."requiresReacceptance"
           FROM "LegalDocument" d
           JOIN "LegalDocumentVersion" v
             ON v."id" = d."currentPublishedVersionId"
            AND v."documentId" = d."id"
          WHERE d."status" = 'ACTIVE'
            AND v."status" = 'PUBLISHED'
            AND d."documentType" = ANY($1::text[])`,
          [documentTypes],
        );
        return Object.freeze(
          result.rows.map((row) => snapshot(row as Record<string, unknown>)),
        );
      } finally {
        await client.end();
      }
    },
  });
}
