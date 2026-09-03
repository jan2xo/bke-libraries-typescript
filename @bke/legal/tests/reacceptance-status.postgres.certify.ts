import { Client } from "pg";
import { createLegalReacceptanceStatusCapability } from "../logic/reacceptance-status";
import { createPostgresLegalReacceptanceStatusRepository } from "../prisma/repositories/postgres-reacceptance-status-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Legal PostgreSQL certification.");

const client = new Client({ connectionString });
await client.connect();
try {
  const fixtures = [
    { documentId: "legal-old", versionId: "legal-old-v2", type: "PRIVACY_POLICY", title: "Old Privacy", slug: "old-privacy", updatedAt: "2026-01-01T00:00:00Z", requires: true },
    { documentId: "legal-new", versionId: "legal-new-v2", type: "TERMS_OF_SERVICE", title: "New Terms", slug: "new-terms", updatedAt: "2026-09-02T00:00:00Z", requires: true },
    { documentId: "legal-info", versionId: "legal-info-v2", type: "COOKIE_POLICY", title: "Cookie", slug: "cookie", updatedAt: "2026-09-02T00:00:00Z", requires: false },
  ] as const;
  for (const fixture of fixtures) {
    await client.query(
      `INSERT INTO "LegalDocumentVersion"
         ("id", "documentId", "version", "markdownContent", "sha256", "slaVersion", "status", "requiresReacceptance", "publishedAt", "updatedAt", "createdById")
       VALUES ($1, $2, '2.0.0', '# Legal', $3, 'sla-v1', 'PUBLISHED', $4, $5, $5, 'principal-admin')`,
      [fixture.versionId, fixture.documentId, "a".repeat(64), fixture.requires, new Date(fixture.updatedAt)],
    );
    await client.query(
      `INSERT INTO "LegalDocument"
         ("id", "documentType", "title", "slug", "status", "currentPublishedVersionId")
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [fixture.documentId, fixture.type, fixture.title, fixture.slug, fixture.versionId],
    );
  }
} finally {
  await client.end();
}

const capability = createLegalReacceptanceStatusCapability(
  createPostgresLegalReacceptanceStatusRepository(connectionString),
);
const principalEstablishedAt = new Date("2026-06-01T00:00:00Z");
const pending = await capability.check({ principalId: "principal-customer", principalEstablishedAt });
if (
  pending.status !== "REACCEPTANCE_REQUIRED" ||
  pending.pending.length !== 1 ||
  pending.pending[0]?.documentVersionId !== "legal-new-v2"
) {
  throw new Error(`Reacceptance age/current-version semantics mismatch: ${JSON.stringify(pending)}`);
}

const acceptClient = new Client({ connectionString });
await acceptClient.connect();
try {
  await acceptClient.query(
    `INSERT INTO "LegalAcceptance"
       ("id", "principalId", "documentId", "documentVersionId", "acceptanceContext", "slaVersion", "renderedContentSha256", "variablesSnapshot")
     VALUES ('acceptance-current', 'principal-customer', 'legal-new', 'legal-new-v2', 'legal-reacceptance', 'sla-v1', $1, '{}'::jsonb)`,
    ["b".repeat(64)],
  );
} finally {
  await acceptClient.end();
}

const current = await capability.check({ principalId: "principal-customer", principalEstablishedAt });
if (current.status !== "CURRENT") throw new Error(`Expected CURRENT after acceptance: ${JSON.stringify(current)}`);

console.log("Legal reacceptance PostgreSQL certification GREEN");
