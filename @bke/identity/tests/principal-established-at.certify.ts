import { Client } from "pg";
import { createPostgresIdentityRepository } from "../prisma/repositories/postgres-identity-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Identity PostgreSQL certification.");

const establishedAt = new Date("2026-01-15T03:04:05.000Z");
const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(
    `INSERT INTO "User"
       ("id", "email", "name", "emailVerified", "role", "createdAt", "updatedAt", "lifecycleState")
     VALUES ($1, $2, $3, $4, 'CUSTOMER', $5, $6, 'ACTIVE')`,
    [
      "principal-established-cert",
      "established@example.com",
      "Established Principal",
      new Date("2026-01-16T00:00:00.000Z"),
      establishedAt,
      new Date("2026-09-03T00:00:00.000Z"),
    ],
  );
  await client.query(
    `INSERT INTO "PasswordCredential" ("userId", "passwordHash") VALUES ($1, $2)`,
    ["principal-established-cert", "opaque-certification-hash"],
  );
} finally {
  await client.end();
}

const repository = createPostgresIdentityRepository(connectionString);
const byId = await repository.findById("principal-established-cert");
if (!byId || byId.establishedAt.getTime() !== establishedAt.getTime()) {
  throw new Error(`Identity lookup did not expose canonical establishment time: ${JSON.stringify(byId)}`);
}
const byEmail = await repository.findByEmail("established@example.com");
if (!byEmail || byEmail.establishedAt.getTime() !== establishedAt.getTime()) {
  throw new Error("Identity email lookup did not preserve canonical establishment time.");
}
const authentication = await repository.findPasswordAuthenticationByEmail("established@example.com");
if (!authentication || authentication.principal.establishedAt.getTime() !== establishedAt.getTime()) {
  throw new Error("Identity password-authentication projection did not preserve establishment time.");
}

console.log("Identity principal establishment PostgreSQL certification GREEN");
