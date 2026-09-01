import { Client } from "pg";
import { createAccountsSwitchableAccountListCapability } from "../logic/switchable-account-list";
import { createPostgresAccountsSwitchableAccountListRepository } from "../prisma/repositories/postgres-switchable-account-list-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Accounts switchable-list certification.");

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `INSERT INTO "CustomerAccount"
       ("id", "type", "displayName", "ownerId", "billingEmail", "lifecycleState", "createdAt")
     VALUES
       ('switch-individual', 'INDIVIDUAL', 'Personal', 'switch-principal', 'personal@example.com', 'ACTIVE', '2026-01-01T00:00:00Z'),
       ('switch-org', 'ORGANIZATION', 'Shared Org', 'org-owner', 'org@example.com', 'ACTIVE', '2026-01-02T00:00:00Z'),
       ('switch-suspended', 'INDIVIDUAL', 'Suspended', 'switch-principal', 'suspended@example.com', 'SUSPENDED', '2025-01-01T00:00:00Z'),
       ('switch-unrelated', 'ORGANIZATION', 'Unrelated', 'other-owner', 'other@example.com', 'ACTIVE', '2026-01-03T00:00:00Z')`,
  );
  await client.query(
    `INSERT INTO "Membership" ("accountId", "userId", "role")
     VALUES ('switch-org', 'switch-principal', 'BILLING')`,
  );

  const capability = createAccountsSwitchableAccountListCapability(
    createPostgresAccountsSwitchableAccountListRepository(connectionString),
  );
  const result = await capability.list({ principalId: "switch-principal" });
  if (result.status !== "LISTED") {
    throw new Error(`Expected LISTED, received ${JSON.stringify(result)}`);
  }
  const expected = [
    {
      id: "switch-individual",
      type: "INDIVIDUAL",
      displayName: "Personal",
      lifecycleState: "ACTIVE",
      effectiveRole: "OWNER",
    },
    {
      id: "switch-org",
      type: "ORGANIZATION",
      displayName: "Shared Org",
      lifecycleState: "ACTIVE",
      effectiveRole: "BILLING",
    },
  ];
  if (JSON.stringify(result.accounts) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected switchable accounts: ${JSON.stringify(result.accounts)}`);
  }

  console.log("Accounts switchable account list PostgreSQL certification GREEN");
} finally {
  await client.end();
}
