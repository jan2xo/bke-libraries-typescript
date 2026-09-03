import { Client } from "pg";
import { createLegalCheckoutRequirementsCapability } from "../logic/checkout-requirements";
import { createPostgresLegalCheckoutRequirementsRepository } from "../prisma/repositories/postgres-checkout-requirements-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Legal PostgreSQL certification.");

const documents = [
  { id: "legal-eula", type: "SOFTWARE_LICENSE_AGREEMENT", title: "EULA", slug: "eula", versionId: "legal-eula-v1", hash: "1".repeat(64) },
  { id: "legal-refund", type: "REFUND_POLICY", title: "Refund Policy", slug: "refund", versionId: "legal-refund-v1", hash: "2".repeat(64) },
  { id: "legal-subscription", type: "SUBSCRIPTION_TERMS", title: "Subscription Terms", slug: "subscription", versionId: "legal-subscription-v1", hash: "3".repeat(64) },
] as const;

const client = new Client({ connectionString });
await client.connect();
try {
  for (const document of documents) {
    await client.query(
      `INSERT INTO "LegalDocumentVersion"
         ("id", "documentId", "version", "name", "slug", "markdownContent", "sha256", "slaVersion", "status", "publishedAt", "createdById")
       VALUES ($1, $2, '1.0.0', $3, $4, $5, $6, 'sla-v1', 'PUBLISHED', CURRENT_TIMESTAMP, 'principal-admin')`,
      [document.versionId, document.id, document.title, document.slug, `# ${document.title}`, document.hash],
    );
    await client.query(
      `INSERT INTO "LegalDocument"
         ("id", "documentType", "title", "slug", "status", "currentPublishedVersionId")
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [document.id, document.type, document.title, document.slug, document.versionId],
    );
  }
} finally {
  await client.end();
}

const capability = createLegalCheckoutRequirementsCapability(
  createPostgresLegalCheckoutRequirementsRepository(connectionString),
);

const perpetual = await capability.resolve({ planType: "PERPETUAL" });
if (perpetual.status !== "RESOLVED" || perpetual.requirements.length !== 2) {
  throw new Error(`Perpetual legal bundle mismatch: ${JSON.stringify(perpetual)}`);
}

const annual = await capability.resolve({
  planType: "ANNUAL",
  selectedVersionIds: ["legal-subscription-v1", "legal-eula-v1", "legal-refund-v1"],
});
if (annual.status !== "RESOLVED" || annual.requirements.length !== 3) {
  throw new Error(`Annual legal bundle mismatch: ${JSON.stringify(annual)}`);
}
if (annual.requirements[0]?.renderedContentSha256 !== "1".repeat(64)) {
  throw new Error("Canonical Legal hash was not returned by requirement resolution.");
}

const stale = await capability.resolve({
  planType: "ANNUAL",
  selectedVersionIds: ["legal-eula-v1", "legal-refund-v1", "stale-version"],
});
if (stale.status !== "REJECTED" || stale.code !== "LEGAL_ACCEPTANCE_REQUIRED") {
  throw new Error("Stale legal selection must be rejected.");
}

console.log("Legal checkout requirements PostgreSQL certification GREEN");
