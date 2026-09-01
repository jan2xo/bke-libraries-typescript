import { createHmac } from "node:crypto";
import { Client } from "pg";
import { createIdentityPasswordResetRequestCapability } from "../logic/password-reset-request";
import { createHmacPasswordResetTokenProvider } from "../providers/hmac-password-reset-token-provider";
import { createPostgresIdentityPasswordResetRequestRepository } from "../prisma/repositories/postgres-password-reset-request-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity password-reset request certification.");
}

const now = new Date("2026-08-31T05:15:00.000Z");
const sessionSecret = "identity-password-reset-request-secret";
const client = new Client({ connectionString });
await client.connect();

try {
  await client.query(
    `INSERT INTO "User" ("id", "email", "name", "updatedAt", "lifecycleState")
     VALUES ('reset-user', 'reset@example.com', 'Reset User', $1, 'ACTIVE')`,
    [now],
  );
  await client.query(
    `INSERT INTO "PasswordResetToken" ("id", "userId", "tokenHash", "expiresAt")
     VALUES ('existing-reset', 'reset-user', 'existing-hash', $1)`,
    [new Date(now.getTime() + 5 * 60_000)],
  );

  const capability = createIdentityPasswordResetRequestCapability(
    createPostgresIdentityPasswordResetRequestRepository(connectionString),
    createHmacPasswordResetTokenProvider(sessionSecret),
    () => now,
  );

  const result = await capability.request({ email: " RESET@EXAMPLE.COM " });
  if (result.status !== "ACCEPTED" || !result.delivery) {
    throw new Error(`Password-reset request did not issue delivery material: ${JSON.stringify(result)}`);
  }

  const rows = await client.query<{
    id: string;
    tokenHash: string;
    expiresAt: Date;
  }>(
    `SELECT "id", "tokenHash", "expiresAt"
       FROM "PasswordResetToken"
      WHERE "userId" = 'reset-user'
      ORDER BY "createdAt", "id"`,
  );
  if (rows.rowCount !== 2) {
    throw new Error(`Expected additive issuance to preserve existing token; found ${rows.rowCount}`);
  }
  const created = rows.rows.find((row) => row.id !== "existing-reset");
  if (!created) {
    throw new Error("New password-reset token was not persisted.");
  }
  const expectedHash = createHmac("sha256", sessionSecret)
    .update(result.delivery.token)
    .digest("hex");
  if (created.tokenHash !== expectedHash || created.tokenHash === result.delivery.token) {
    throw new Error("Password-reset persistence did not store only the token HMAC.");
  }
  if (created.expiresAt.getTime() !== now.getTime() + 30 * 60_000) {
    throw new Error(`Password-reset TTL mismatch: ${created.expiresAt.toISOString()}`);
  }
  if (!rows.rows.some((row) => row.id === "existing-reset" && row.tokenHash === "existing-hash")) {
    throw new Error("Existing password-reset token was modified or removed.");
  }

  const beforeMissing = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "PasswordResetToken"`,
  );
  const missing = await capability.request({ email: "missing@example.com" });
  const afterMissing = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS "count" FROM "PasswordResetToken"`,
  );
  if (
    missing.status !== "ACCEPTED" ||
    missing.delivery !== null ||
    beforeMissing.rows[0]?.count !== afterMissing.rows[0]?.count
  ) {
    throw new Error("Missing-principal password-reset request leaked state or mutated persistence.");
  }

  console.log("Identity password-reset request certification GREEN");
} finally {
  await client.end();
}
