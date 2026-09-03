import { Client } from "pg";
import { createLegalAcceptanceCapability } from "../logic/acceptance";
import { legalRenderedContentSha256 } from "../logic/render";
import { createPostgresLegalAcceptanceRepository } from "../prisma/repositories/postgres-acceptance-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Legal PostgreSQL certification.");

const markdown = "# Terms\nCompany {{company_name}}";
const variables = { company_name: "BKE Digital Solutions" };
const renderedHash = legalRenderedContentSha256(markdown, variables);
const publishedHash = "b".repeat(64);
const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `INSERT INTO "LegalDocumentVersion"
       ("id", "documentId", "version", "name", "markdownContent", "sha256", "slaVersion", "status", "publishedAt", "createdById")
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'PUBLISHED', CURRENT_TIMESTAMP, $8)`,
    ["legal-terms-v1", "legal-terms", "1.0.0", "Terms", markdown, publishedHash, "sla-v1", "principal-admin"],
  );
} finally {
  await client.end();
}

const capability = createLegalAcceptanceCapability(
  createPostgresLegalAcceptanceRepository(connectionString),
);
const recorded = await capability.record({
  principalId: "principal-customer",
  customerAccountId: "account-opaque-1",
  documentId: "legal-terms",
  documentVersionId: "legal-terms-v1",
  acceptanceContext: "checkout",
  slaVersion: "sla-v1",
  renderedContentSha256: renderedHash,
  variablesSnapshot: variables,
  ipAddress: "127.0.0.1",
  userAgent: "BKE-Certifier/1.0",
});
if (recorded.status !== "RECORDED") throw new Error(`Expected RECORDED, got ${JSON.stringify(recorded)}`);
if (recorded.value.ipAddress !== "127.0.0.1" || recorded.value.userAgent !== "BKE-Certifier/1.0") {
  throw new Error("Acceptance request evidence was not returned canonically.");
}

const wrongRecordHash = await capability.record({
  principalId: "principal-customer",
  customerAccountId: "account-opaque-1",
  documentId: "legal-terms",
  documentVersionId: "legal-terms-v1",
  acceptanceContext: "checkout",
  slaVersion: "sla-v1",
  renderedContentSha256: publishedHash,
  variablesSnapshot: variables,
});
if (wrongRecordHash.status !== "REJECTED" || wrongRecordHash.code !== "DOCUMENT_VERSION_MISMATCH") {
  throw new Error("Acceptance recording must reject a hash that is not the rendered document hash.");
}

const accepted = await capability.check({
  principalId: "principal-customer",
  customerAccountId: "account-opaque-1",
  documentId: "legal-terms",
  documentVersionId: "legal-terms-v1",
  acceptanceContext: "checkout",
  slaVersion: "sla-v1",
  renderedContentSha256: renderedHash,
});
if (accepted.status !== "ACCEPTED") throw new Error(`Expected ACCEPTED, got ${JSON.stringify(accepted)}`);

const verifyClient = new Client({ connectionString });
await verifyClient.connect();
try {
  const evidence = await verifyClient.query<{ ipAddress: string | null; userAgent: string | null }>(
    `SELECT "ipAddress", "userAgent" FROM "LegalAcceptance" WHERE "id" = $1`,
    [recorded.value.acceptanceId],
  );
  if (evidence.rows[0]?.ipAddress !== "127.0.0.1" || evidence.rows[0]?.userAgent !== "BKE-Certifier/1.0") {
    throw new Error("Acceptance request evidence was not persisted.");
  }
} finally {
  await verifyClient.end();
}

const wrongContext = await capability.check({
  principalId: "principal-customer",
  customerAccountId: "account-opaque-1",
  documentId: "legal-terms",
  documentVersionId: "legal-terms-v1",
  acceptanceContext: "licensing",
  slaVersion: "sla-v1",
  renderedContentSha256: renderedHash,
});
if (wrongContext.status !== "NOT_ACCEPTED") throw new Error("Acceptance context must be exact.");

const mismatch = await capability.record({
  principalId: "principal-customer",
  documentId: "other-document",
  documentVersionId: "legal-terms-v1",
  acceptanceContext: "checkout",
  slaVersion: "sla-v1",
  renderedContentSha256: renderedHash,
  variablesSnapshot: variables,
});
if (mismatch.status !== "REJECTED" || mismatch.code !== "DOCUMENT_VERSION_MISMATCH") {
  throw new Error("Document/version mismatch must be rejected.");
}

console.log("Legal acceptance PostgreSQL certification GREEN");
