import { Client } from "pg";
import { createPostgresIdentityRepository } from "../prisma/repositories/postgres-identity-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity persistence certification.");
}

const expectedTables = [
  "AdministratorMfaMethod",
  "AdministratorRecoveryCode",
  "EmergencyMfaEnrollmentAuthorization",
  "MfaChallenge",
  "PasswordCredential",
  "PasswordResetToken",
  "Session",
  "User",
  "VerificationToken",
].sort();

const client = new Client({ connectionString });
await client.connect();

try {
  const tables = await client.query<{ table_name: string }>(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
       AND table_name NOT IN ('_bke_module_migrations', '_prisma_migrations')
     ORDER BY table_name
  `);

  const actualTables = tables.rows.map((row) => row.table_name).sort();
  if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
    throw new Error(
      `Identity table ownership mismatch. expected=${expectedTables.join(",")} actual=${actualTables.join(",")}`,
    );
  }

  const now = new Date();
  await client.query(
    `INSERT INTO "User"
       ("id", "email", "name", "emailVerified", "role", "updatedAt", "lifecycleState")
     VALUES ($1, $2, $3, $4, 'CUSTOMER', $5, 'ACTIVE')`,
    ["identity-cert-user", "identity-cert@example.com", "Identity Cert", now, now],
  );

  const repository = createPostgresIdentityRepository(connectionString);
  const byId = await repository.findById("identity-cert-user");
  const byEmail = await repository.findByEmail("identity-cert@example.com");
  const missing = await repository.findById("identity-cert-missing");

  if (byId?.email !== "identity-cert@example.com") {
    throw new Error("Identity repository failed id lookup certification.");
  }
  if (byEmail?.id !== "identity-cert-user") {
    throw new Error("Identity repository failed email lookup certification.");
  }
  if (missing !== null) {
    throw new Error("Identity repository returned a principal for a missing id.");
  }

  let constraintRejected = false;
  try {
    await client.query(
      `INSERT INTO "MfaChallenge"
         ("id", "userId", "tokenHash", "expiresAt", "attemptCount")
       VALUES ($1, $2, $3, $4, 6)`,
      [
        "identity-cert-mfa",
        "identity-cert-user",
        "identity-cert-mfa-token",
        new Date(Date.now() + 60_000),
      ],
    );
  } catch (error) {
    constraintRejected = (error as { code?: string }).code === "23514";
  }

  if (!constraintRejected) {
    throw new Error("MfaChallenge attempt-count invariant was not enforced.");
  }

  const ledger = await client.query<{
    migrationName: string;
    finishedAt: Date | null;
    rolledBackAt: Date | null;
  }>(`
    SELECT "migration_name" AS "migrationName",
           "finished_at" AS "finishedAt",
           "rolled_back_at" AS "rolledBackAt"
      FROM "_prisma_migrations"
     ORDER BY "started_at"
  `);

  if (
    ledger.rows.length !== 1 ||
    ledger.rows[0]?.migrationName !== "0001_identity_baseline" ||
    !ledger.rows[0]?.finishedAt ||
    ledger.rows[0]?.rolledBackAt !== null
  ) {
    throw new Error(`Unexpected Identity Prisma migration ledger: ${JSON.stringify(ledger.rows)}`);
  }

  console.log("Identity persistence certification GREEN");
} finally {
  await client.end();
}
