import { Client } from "pg";
import { createLegalAcceptanceCapability } from "../logic/acceptance";
import { createPostgresLegalAcceptanceRepository } from "../prisma/repositories/postgres-acceptance-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Legal PostgreSQL certification.");

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `INSERT INTO "LegalDocumentVersion"
       ("id", "documentId", "version", "name", "markdownContent", "sha256", "slaVersion", "createdById")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      "legal-terms-v1",
      "legal-terms",
      "1.0.0",
      "Terms",
      "# Terms",
      "b".repeat(64),
      "sla-v1",
      "principal-admin",
    ],
  );
} finally {
  await client.end();
}

const capability = createLegalAcceptanceCapability(
  createPostgresLegalAcceptanceRepository(connectionString),
);
const renderedHash = "a".repeat(64);
const recorded = await capability.record({
  principalId: "principal-customer",
  customerAccountId: "account-opaque-1",
  documentId: "legal-terms",
  documentVersionId: "legal-terms-v1",
  acceptanceContext: "checkout",
  slaVersion: "sla-v1",
  renderedContentSha256: renderedHash,
  variablesSnapshot: { customerName: "Certification Customer" },
});
if (recorded.status !== "RECORDED") {
  throw new Error(`Expected RECORDED, got ${JSON.stringify(recorded)}`);
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
if (accepted.status !== "ACCEPTED") {
  throw new Error(`Expected ACCEPTED, got ${JSON.stringify(accepted)}`);
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
if (wrongContext.status !== "NOT_ACCEPTED") {
  throw new Error("Acceptance context must be exact.");
}

const wrongHash = await capability.check({
  principalId: "principal-customer",
  customerAccountId: "account-opaque-1",
  documentId: "legal-terms",
  documentVersionId: "legal-terms-v1",
  acceptanceContext: "checkout",
  slaVersion: "sla-v1",
  renderedContentSha256: "c".repeat(64),
});
if (wrongHash.status !== "NOT_ACCEPTED") {
  throw new Error("Rendered-content hash must be exact.");
}

const mismatch = await capability.record({
  principalId: "principal-customer",
  documentId: "other-document",
  documentVersionId: "legal-terms-v1",
  acceptanceContext: "checkout",
  slaVersion: "sla-v1",
  renderedContentSha256: renderedHash,
  variablesSnapshot: {},
});
if (mismatch.status !== "REJECTED" || mismatch.code !== "DOCUMENT_VERSION_MISMATCH") {
  throw new Error("Document/version mismatch must be rejected.");
}

console.log("Legal acceptance PostgreSQL certification GREEN");
