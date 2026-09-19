import { Client } from "pg";
import { createIdentityFederatedAuthenticationCapability } from "../logic/federated-authentication";
import { createPostgresIdentityFederatedAuthenticationRepository } from "../prisma/repositories/postgres-federated-authentication-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Identity federation certification.");

const client = new Client({ connectionString });
await client.connect();
const authenticatedAt = new Date("2026-09-19T00:00:00Z");

async function user(id: string, email: string, role: "CUSTOMER" | "ADMIN" = "CUSTOMER") {
  await client.query(
    `INSERT INTO "User" ("id","email","name","emailVerified","role","createdAt","updatedAt","lifecycleState")
     VALUES ($1,$2,'Federation Cert',$4,$3::"IdentityRole",$4,$4,'ACTIVE')`,
    [id, email, role, new Date("2026-01-01T00:00:00Z")],
  );
}

try {
  await user("federated-existing", "federation-existing-cert@bke.test");
  const capability = createIdentityFederatedAuthenticationCapability(
    createPostgresIdentityFederatedAuthenticationRepository(connectionString),
  );

  const first = await capability.authenticate({
    provider: "GOOGLE",
    subject: "google-existing-sub",
    email: "FEDERATION-EXISTING-CERT@bke.test",
    emailVerified: true,
    name: "Existing",
    authenticatedAt,
  });
  if (
    first.status !== "AUTHENTICATED" ||
    first.binding !== "LINKED_BY_VERIFIED_EMAIL" ||
    first.principal.id !== "federated-existing" ||
    !first.principal.emailVerified
  ) {
    throw new Error(`Verified-email federation link failed: ${JSON.stringify(first)}`);
  }

  const second = await capability.authenticate({
    provider: "GOOGLE",
    subject: "google-existing-sub",
    email: "federation-observed-cert@bke.test",
    emailVerified: true,
    name: "Existing",
    authenticatedAt: new Date(authenticatedAt.getTime() + 1000),
  });
  if (
    second.status !== "AUTHENTICATED" ||
    second.binding !== "EXISTING" ||
    second.principal.id !== "federated-existing"
  ) {
    throw new Error(`Durable provider-subject binding failed: ${JSON.stringify(second)}`);
  }

  const binding = await client.query<{
    userId: string;
    emailAtLink: string;
    lastObservedEmail: string;
  }>(
    `SELECT "userId","emailAtLink","lastObservedEmail"
       FROM "ExternalIdentity"
      WHERE "provider"='GOOGLE' AND "subject"='google-existing-sub'`,
  );
  if (
    binding.rows[0]?.userId !== "federated-existing" ||
    binding.rows[0]?.emailAtLink !== "federation-existing-cert@bke.test" ||
    binding.rows[0]?.lastObservedEmail !== "federation-observed-cert@bke.test"
  ) {
    throw new Error(`Federated binding persistence drifted: ${JSON.stringify(binding.rows[0])}`);
  }

  await client.query(
    `INSERT INTO "User" ("id","email","name","role","createdAt","updatedAt","lifecycleState")
     VALUES ('federated-unverified','federation-unverified-cert@bke.test','Unverified','CUSTOMER',$1,$1,'ACTIVE')`,
    [new Date("2026-01-01T00:00:00Z")],
  );
  const unverified = await capability.authenticate({
    provider: "GOOGLE",
    subject: "google-unverified-sub",
    email: "federation-unverified-cert@bke.test",
    emailVerified: true,
    name: "Unverified",
    authenticatedAt,
  });
  if (unverified.status !== "REJECTED" || unverified.code !== "EMAIL_LINK_REQUIRES_VERIFICATION") {
    throw new Error(`Unverified local email must not auto-link: ${JSON.stringify(unverified)}`);
  }

  const registration = await capability.authenticate({
    provider: "GOOGLE",
    subject: "google-new-sub",
    email: "federation-new-cert@bke.test",
    emailVerified: true,
    name: "New User",
    authenticatedAt,
  });
  if (registration.status !== "REGISTRATION_REQUIRED") {
    throw new Error(`Unknown Google identity must require registration: ${JSON.stringify(registration)}`);
  }

  await user("federated-admin", "federation-admin-cert@bke.test", "ADMIN");
  const admin = await capability.authenticate({
    provider: "GOOGLE",
    subject: "google-admin-sub",
    email: "federation-admin-cert@bke.test",
    emailVerified: true,
    name: "Admin",
    authenticatedAt,
  });
  if (admin.status !== "REJECTED" || admin.code !== "ADMIN_FEDERATION_FORBIDDEN") {
    throw new Error(`Admin federation must fail closed: ${JSON.stringify(admin)}`);
  }

  console.log("Identity federated authentication PostgreSQL certification GREEN");
} finally {
  await client.end();
}
