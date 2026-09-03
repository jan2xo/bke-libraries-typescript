import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  LegalAcceptanceSnapshot,
  LegalCheckAcceptanceInput,
  LegalCheckAcceptanceResult,
  LegalRecordAcceptanceInput,
  LegalRecordAcceptanceResult,
} from "../../contracts/acceptance.contract";
import type { LegalAcceptanceRepository } from "../../logic/acceptance-repository";

function optionalString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function snapshot(row: Record<string, unknown>): LegalAcceptanceSnapshot {
  return {
    acceptanceId: String(row.id),
    principalId: String(row.principalId),
    customerAccountId: optionalString(row.customerAccountId),
    documentId: String(row.documentId),
    documentVersionId: String(row.documentVersionId),
    acceptanceContext: String(row.acceptanceContext),
    slaVersion: String(row.slaVersion),
    renderedContentSha256: String(row.renderedContentSha256),
    variablesSnapshot: row.variablesSnapshot,
    ipAddress: optionalString(row.ipAddress),
    userAgent: optionalString(row.userAgent),
    acceptedAt: row.acceptedAt instanceof Date ? row.acceptedAt : new Date(String(row.acceptedAt)),
  };
}

export function createPostgresLegalAcceptanceRepository(
  connectionString: string,
): LegalAcceptanceRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) throw new Error("Legal PostgreSQL connection string is required.");

  return Object.freeze({
    async record(input: LegalRecordAcceptanceInput): Promise<LegalRecordAcceptanceResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const version = await client.query(
          `SELECT "documentId", "slaVersion", "sha256"
             FROM "LegalDocumentVersion"
            WHERE "id" = $1`,
          [input.documentVersionId],
        );
        if (!version.rowCount) return { status: "REJECTED", code: "DOCUMENT_VERSION_NOT_FOUND" };
        const target = version.rows[0] as { documentId: string; slaVersion: string; sha256: string };
        if (
          target.documentId !== input.documentId ||
          target.slaVersion !== input.slaVersion ||
          target.sha256 !== input.renderedContentSha256
        ) {
          return { status: "REJECTED", code: "DOCUMENT_VERSION_MISMATCH" };
        }

        const result = await client.query(
          `INSERT INTO "LegalAcceptance" (
             "id", "principalId", "customerAccountId", "documentId", "documentVersionId",
             "acceptanceContext", "slaVersion", "renderedContentSha256", "variablesSnapshot",
             "ipAddress", "userAgent"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
           RETURNING *`,
          [
            randomUUID(),
            input.principalId,
            input.customerAccountId ?? null,
            input.documentId,
            input.documentVersionId,
            input.acceptanceContext,
            input.slaVersion,
            input.renderedContentSha256,
            JSON.stringify(input.variablesSnapshot ?? null),
            input.ipAddress ?? null,
            input.userAgent ?? null,
          ],
        );
        return { status: "RECORDED", value: snapshot(result.rows[0] as Record<string, unknown>) };
      } finally {
        await client.end();
      }
    },

    async check(input: LegalCheckAcceptanceInput): Promise<LegalCheckAcceptanceResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query(
          `SELECT *
             FROM "LegalAcceptance"
            WHERE "principalId" = $1
              AND "customerAccountId" IS NOT DISTINCT FROM $2
              AND "documentId" = $3
              AND "documentVersionId" = $4
              AND "acceptanceContext" = $5
              AND "slaVersion" = $6
              AND "renderedContentSha256" = $7
            ORDER BY "acceptedAt" DESC
            LIMIT 1`,
          [
            input.principalId,
            input.customerAccountId ?? null,
            input.documentId,
            input.documentVersionId,
            input.acceptanceContext,
            input.slaVersion,
            input.renderedContentSha256,
          ],
        );
        if (!result.rowCount) return { status: "NOT_ACCEPTED" };
        return { status: "ACCEPTED", value: snapshot(result.rows[0] as Record<string, unknown>) };
      } finally {
        await client.end();
      }
    },
  });
}
