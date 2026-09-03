import { Client } from "pg";
import type { LegalDocumentType } from "../../contracts/checkout-requirements.contract";
import type {
  LegalPendingReacceptanceSnapshot,
  LegalReacceptanceStatusInput,
} from "../../contracts/reacceptance-status.contract";
import type { LegalReacceptanceStatusRepository } from "../../logic/reacceptance-status-repository";

function snapshot(row: Record<string, unknown>): LegalPendingReacceptanceSnapshot {
  return {
    documentId: String(row.documentId),
    documentType: String(row.documentType) as LegalDocumentType,
    title: String(row.title),
    slug: String(row.slug),
    documentVersionId: String(row.documentVersionId),
    version: String(row.version),
    publishedAt: row.publishedAt instanceof Date ? row.publishedAt : new Date(String(row.publishedAt)),
  };
}

export function createPostgresLegalReacceptanceStatusRepository(
  connectionString: string,
): LegalReacceptanceStatusRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) throw new Error("Legal PostgreSQL connection string is required.");

  return Object.freeze({
    async findPending(input: LegalReacceptanceStatusInput) {
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
             v."publishedAt"
           FROM "LegalDocument" d
           JOIN "LegalDocumentVersion" v
             ON v."id" = d."currentPublishedVersionId"
            AND v."documentId" = d."id"
          WHERE d."status" = 'ACTIVE'
            AND v."status" = 'PUBLISHED'
            AND v."requiresReacceptance" = true
            AND v."updatedAt" > $2
            AND NOT EXISTS (
              SELECT 1
                FROM "LegalAcceptance" a
               WHERE a."principalId" = $1
                 AND a."documentVersionId" = v."id"
            )
          ORDER BY d."title" ASC`,
          [input.principalId, input.principalEstablishedAt],
        );
        return Object.freeze(result.rows.map((row) => snapshot(row as Record<string, unknown>)));
      } finally {
        await client.end();
      }
    },
  });
}
