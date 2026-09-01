import argon2 from "argon2";
import { Client } from "pg";
import { createIdentityPasswordAuthenticationCapability } from "../logic/password-authentication";
import { createArgon2PasswordVerifier } from "../providers/argon2-password-verifier";
import { createPostgresIdentityRepository } from "../prisma/repositories/postgres-identity-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Identity authentication certification.");
}

const password = "CorrectPassword123";
const passwordHash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

const client = new Client({ connectionString });
await client.connect();

try {
  const now = new Date();
  const users = [
    ["auth-cert-customer", "auth-customer@example.com", "CUSTOMER"],
    ["auth-cert-admin-mfa", "auth-admin-mfa@example.com", "ADMIN"],
    ["auth-cert-admin-enroll", "auth-admin-enroll@example.com", "ADMIN"],
    ["auth-cert-no-credential", "auth-no-credential@example.com", "CUSTOMER"],
  ] as const;

  for (const [id, email, role] of users) {
    await client.query(
      `INSERT INTO "User"
         ("id", "email", "name", "emailVerified", "role", "updatedAt", "lifecycleState")
       VALUES ($1, $2, $3, $4, $5, $4, 'ACTIVE')`,
      [id, email, `Certification ${id}`, now, role],
    );
  }

  for (const userId of [
    "auth-cert-customer",
    "auth-cert-admin-mfa",
    "auth-cert-admin-enroll",
  ]) {
    await client.query(
      `INSERT INTO "PasswordCredential" ("userId", "passwordHash")
       VALUES ($1, $2)`,
      [userId, passwordHash],
    );
  }

  await client.query(
    `INSERT INTO "AdministratorMfaMethod"
       ("id", "userId", "enabledAt", "verifiedAt", "updatedAt")
     VALUES ($1, $2, $3, $3, $3)`,
    ["auth-cert-admin-mfa-method", "auth-cert-admin-mfa", now],
  );

  const authentication = createIdentityPasswordAuthenticationCapability(
    createPostgresIdentityRepository(connectionString),
    createArgon2PasswordVerifier(),
  );

  const customer = await authentication.authenticate({
    email: " AUTH-CUSTOMER@EXAMPLE.COM ",
    password,
  });
  if (
    customer.status !== "PRIMARY_AUTHENTICATED" ||
    customer.principal.id !== "auth-cert-customer" ||
    customer.route !== "CUSTOMER_SESSION"
  ) {
    throw new Error(`Customer authentication certification failed: ${JSON.stringify(customer)}`);
  }

  const adminMfa = await authentication.authenticate({
    email: "auth-admin-mfa@example.com",
    password,
  });
  if (
    adminMfa.status !== "PRIMARY_AUTHENTICATED" ||
    adminMfa.principal.id !== "auth-cert-admin-mfa" ||
    adminMfa.route !== "ADMIN_MFA_CHALLENGE"
  ) {
    throw new Error(`Admin MFA routing certification failed: ${JSON.stringify(adminMfa)}`);
  }

  const adminEnrollment = await authentication.authenticate({
    email: "auth-admin-enroll@example.com",
    password,
  });
  if (
    adminEnrollment.status !== "PRIMARY_AUTHENTICATED" ||
    adminEnrollment.principal.id !== "auth-cert-admin-enroll" ||
    adminEnrollment.route !== "ADMIN_MFA_ENROLLMENT"
  ) {
    throw new Error(
      `Admin MFA enrollment routing certification failed: ${JSON.stringify(adminEnrollment)}`,
    );
  }

  const wrongPassword = await authentication.authenticate({
    email: "auth-customer@example.com",
    password: "WrongPassword123",
  });
  if (wrongPassword.status !== "INVALID_CREDENTIALS") {
    throw new Error(`Wrong-password fail-closed proof failed: ${JSON.stringify(wrongPassword)}`);
  }

  const noCredential = await authentication.authenticate({
    email: "auth-no-credential@example.com",
    password,
  });
  if (noCredential.status !== "INVALID_CREDENTIALS") {
    throw new Error(`Missing-credential fail-closed proof failed: ${JSON.stringify(noCredential)}`);
  }

  const missingIdentity = await authentication.authenticate({
    email: "auth-missing@example.com",
    password,
  });
  if (missingIdentity.status !== "INVALID_CREDENTIALS") {
    throw new Error(`Missing-identity fail-closed proof failed: ${JSON.stringify(missingIdentity)}`);
  }

  console.log("Identity password authentication certification GREEN");
} finally {
  await client.end();
}
