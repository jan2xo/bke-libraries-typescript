import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createPostgresIdentityGoogleIdentityRepository, createTransactionBoundPostgresGoogleIdentityRepository } from "../prisma/repositories/postgres-google-identity-repository";
import { createIdentityGooglePrincipalBindingCapability } from "../logic/google-identity";
import { createIdentityGoogleAuthenticationCapability } from "../logic/google-authentication";
import { createHmacSessionTokenProvider } from "../providers/hmac-session-token-provider";
import { createIdentitySessionIssuanceCapability } from "../logic/session-issuance";
import { createIdentitySessionValidationCapability } from "../logic/session-validation";
import { createIdentitySessionTerminationCapability } from "../logic/session-termination";
import { createPostgresIdentitySessionRepository } from "../prisma/repositories/postgres-session-repository";
import { createPostgresIdentitySessionTerminationRepository } from "../prisma/repositories/postgres-session-termination-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Google Identity certification.");

const client = new Client({ connectionString });
await client.connect();
const ids = Array.from({ length: 8 }, () => randomUUID());
const now = new Date();

try {
  await client.query("BEGIN");
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index]!;
    await client.query(
      `INSERT INTO "User" (
         "id", "email", "name", "emailVerified", "role", "updatedAt",
         "lifecycleState", "suspendedAt"
       ) VALUES ($1, $2, 'cert', $3, $4::"IdentityRole", $5, $6::"IdentityLifecycleState", $7)`,
      [
        id,
        `${id}@identity-cert.example.invalid`,
        index === 3 ? null : now,
        index === 7 ? "ADMIN" : "CUSTOMER",
        now,
        index === 2 ? "SUSPENDED" : "ACTIVE",
        index === 2 ? now : null,
      ],
    );
  }
  await client.query("COMMIT");

  const googleRepository = createPostgresIdentityGoogleIdentityRepository(connectionString);
  const capability = createIdentityGooglePrincipalBindingCapability(googleRepository);
  const authentication = createIdentityGoogleAuthenticationCapability(googleRepository);
  const subject = `google-${randomUUID()}`;
  const bound = await capability.bindToUser({ userId: ids[0]!, subject });
  if (bound.status !== "BOUND") throw new Error("First binding failed.");

  const authenticatedCustomer = await authentication.authenticate({ subject });
  if (
    authenticatedCustomer.status !== "PRIMARY_AUTHENTICATED" ||
    authenticatedCustomer.principal.id !== ids[0] ||
    authenticatedCustomer.route !== "SESSION"
  ) {
    throw new Error("Bound Google subject did not authenticate to the original BKE customer.");
  }

  const sessionSecret = `google-session-cert-${randomUUID()}`;
  const tokens = createHmacSessionTokenProvider(sessionSecret);
  const sessions = createPostgresIdentitySessionRepository(connectionString);
  const issuance = createIdentitySessionIssuanceCapability(sessions, tokens, () => now);
  const validation = createIdentitySessionValidationCapability(sessions, tokens, () => now);
  const termination = createIdentitySessionTerminationCapability(
    createPostgresIdentitySessionTerminationRepository(connectionString),
    tokens,
    () => now,
  );
  const issuedSession = await issuance.issue({
    userId: ids[0]!,
    authenticationMethod: "GOOGLE_OIDC",
  });
  if (
    issuedSession.status !== "ISSUED" ||
    issuedSession.session.assuranceLevel !== "BASIC" ||
    issuedSession.session.mfaVerifiedAt !== null ||
    issuedSession.session.recentAuthenticatedAt !== null
  ) {
    throw new Error("Google login alone received app-MFA or recent-auth assurance.");
  }
  const validatedSession = await validation.validate(issuedSession.token);
  if (
    validatedSession.status !== "VALID" ||
    validatedSession.context.principal.id !== ids[0]
  ) {
    throw new Error("Google session did not validate to the bound BKE identity.");
  }
  const terminated = await termination.terminate(issuedSession.token);
  if (terminated.status !== "TERMINATED") {
    throw new Error("Google session could not be terminated through the existing adapter.");
  }
  const afterTermination = await validation.validate(issuedSession.token);
  if (afterTermination.status !== "INVALID") {
    throw new Error("Terminated Google session remained valid.");
  }

  const found = await capability.findPrincipalBySubject({ subject });
  if (found.status !== "FOUND" || found.principal.id !== ids[0]) {
    throw new Error("Lookup did not preserve the BKE user id.");
  }

  if ((await capability.bindToUser({ userId: ids[0]!, subject })).status !== "ALREADY_BOUND") {
    throw new Error("Repeat binding was not idempotent.");
  }

  await client.query(
    `INSERT INTO "AdministratorMfaMethod"
       ("id", "userId", "enabledAt", "verifiedAt", "updatedAt")
     VALUES ($1, $2, $3, $3, $3)`,
    [`google-cert-mfa-${ids[7]}`, ids[7], now],
  );
  const enrolledSubject = `google-${randomUUID()}`;
  if ((await capability.bindToUser({ userId: ids[7]!, subject: enrolledSubject })).status !== "BOUND") {
    throw new Error("Enrolled administrator Google subject failed to bind.");
  }
  const enrolledAuth = await authentication.authenticate({ subject: enrolledSubject });
  if (
    enrolledAuth.status !== "PRIMARY_AUTHENTICATED" ||
    enrolledAuth.principal.id !== ids[7] ||
    enrolledAuth.route !== "MFA_CHALLENGE"
  ) {
    throw new Error("Google authentication did not route an enrolled administrator through app MFA.");
  }

  const subjectCollision = await capability.bindToUser({
    userId: ids[1]!,
    subject,
  });
  if (subjectCollision.status !== "REJECTED" || subjectCollision.code !== "SUBJECT_ALREADY_BOUND") {
    throw new Error("A Google subject was bound to two users.");
  }

  const userCollision = await capability.bindToUser({
    userId: ids[0]!,
    subject: `google-${randomUUID()}`,
  });
  if (userCollision.status !== "REJECTED" || userCollision.code !== "USER_ALREADY_BOUND") {
    throw new Error("A second Google subject was bound to one user.");
  }

  const inactive = await capability.bindToUser({
    userId: ids[2]!,
    subject: `google-${randomUUID()}`,
  });
  if (inactive.status !== "REJECTED" || inactive.code !== "ACCOUNT_NOT_ACTIVE") {
    throw new Error("An inactive user was bound.");
  }

  const unverifiedContact = await capability.bindToUser({
    userId: ids[3]!,
    subject: `google-${randomUUID()}`,
  });
  if (unverifiedContact.status !== "BOUND") {
    throw new Error("Google binding incorrectly required verified BKE contact email.");
  }

  const sharedSubject = `google-${randomUUID()}`;
  const subjectRace = await Promise.all([
    capability.bindToUser({ userId: ids[4]!, subject: sharedSubject }),
    capability.bindToUser({ userId: ids[5]!, subject: sharedSubject }),
  ]);
  if (
    subjectRace.filter((result) => result.status === "BOUND").length !== 1 ||
    subjectRace.filter(
      (result) => result.status === "REJECTED" && result.code === "SUBJECT_ALREADY_BOUND",
    ).length !== 1
  ) {
    throw new Error(`Concurrent subject binding was unsafe: ${JSON.stringify(subjectRace)}`);
  }

  const sameUserRace = await Promise.all([
    capability.bindToUser({ userId: ids[6]!, subject: `google-${randomUUID()}` }),
    capability.bindToUser({ userId: ids[6]!, subject: `google-${randomUUID()}` }),
  ]);
  if (
    sameUserRace.filter((result) => result.status === "BOUND").length !== 1 ||
    sameUserRace.filter(
      (result) => result.status === "REJECTED" && result.code === "USER_ALREADY_BOUND",
    ).length !== 1
  ) {
    throw new Error(`Concurrent user binding was unsafe: ${JSON.stringify(sameUserRace)}`);
  }

  const registrationUserId = randomUUID();
  const transactionSubject = `google-${randomUUID()}`;
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO "User" (
       "id", "email", "name", "emailVerified", "role", "updatedAt", "lifecycleState"
     ) VALUES ($1, $2, 'registration', NULL, 'CUSTOMER', $3, 'ACTIVE')`,
    [registrationUserId, `${registrationUserId}@identity-cert.example.invalid`, now],
  );
  const transactionCapability = createIdentityGooglePrincipalBindingCapability(
    createTransactionBoundPostgresGoogleIdentityRepository(client),
  );
  const transactionBind = await transactionCapability.bindToUser({
    userId: registrationUserId,
    subject: transactionSubject,
  });
  if (transactionBind.status !== "BOUND") {
    await client.query("ROLLBACK");
    throw new Error("Host transaction-bound repository could not bind the trusted registration user.");
  }
  const insideTransaction = await transactionCapability.findPrincipalBySubject({
    subject: transactionSubject,
  });
  if (insideTransaction.status !== "FOUND" || insideTransaction.principal.id !== registrationUserId) {
    await client.query("ROLLBACK");
    throw new Error("Google binding was not visible in the host registration transaction.");
  }
  await client.query("ROLLBACK");
  const afterRollback = await client.query(
    `SELECT
       EXISTS (SELECT 1 FROM "GoogleIdentity" WHERE "subject" = $1) AS "bindingExists",
       EXISTS (SELECT 1 FROM "User" WHERE "id" = $2) AS "userExists"`,
    [transactionSubject, registrationUserId],
  );
  if (afterRollback.rows[0]?.bindingExists || afterRollback.rows[0]?.userExists) {
    throw new Error("Google registration and binding escaped the host transaction rollback.");
  }

  const committedRegistrationUserId = randomUUID();
  const committedRegistrationSubject = `google-${randomUUID()}`;
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO "User" (
       "id", "email", "name", "emailVerified", "role", "updatedAt", "lifecycleState"
     ) VALUES ($1, $2, 'registration', NULL, 'CUSTOMER', $3, 'ACTIVE')`,
    [
      committedRegistrationUserId,
      `${committedRegistrationUserId}@identity-cert.example.invalid`,
      now,
    ],
  );
  const committedBind = await transactionCapability.bindToUser({
    userId: committedRegistrationUserId,
    subject: committedRegistrationSubject,
  });
  if (committedBind.status !== "BOUND") {
    await client.query("ROLLBACK");
    throw new Error("Transaction-bound registration could not persist a valid subject.");
  }
  await client.query("COMMIT");
  ids.push(committedRegistrationUserId);
  const committedLookup = await capability.findPrincipalBySubject({
    subject: committedRegistrationSubject,
  });
  if (
    committedLookup.status !== "FOUND" ||
    committedLookup.principal.id !== committedRegistrationUserId
  ) {
    throw new Error("Committed host registration did not retain its Google binding.");
  }

  const conflictRegistrationUserId = randomUUID();
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO "User" (
       "id", "email", "name", "emailVerified", "role", "updatedAt", "lifecycleState"
     ) VALUES ($1, $2, 'registration', NULL, 'CUSTOMER', $3, 'ACTIVE')`,
    [
      conflictRegistrationUserId,
      `${conflictRegistrationUserId}@identity-cert.example.invalid`,
      now,
    ],
  );
  const registrationConflict = await transactionCapability.bindToUser({
    userId: conflictRegistrationUserId,
    subject,
  });
  if (
    registrationConflict.status !== "REJECTED" ||
    registrationConflict.code !== "SUBJECT_ALREADY_BOUND"
  ) {
    await client.query("ROLLBACK");
    throw new Error("A duplicate Google subject did not fail host registration.");
  }
  await client.query("ROLLBACK");
  const conflictRollback = await client.query(
    `SELECT EXISTS (SELECT 1 FROM "User" WHERE "id" = $1) AS "userExists"`,
    [conflictRegistrationUserId],
  );
  if (conflictRollback.rows[0]?.userExists) {
    throw new Error("A failed subject collision left an orphan registration.");
  }

  console.log("Google Identity binding PostgreSQL certification GREEN");
} finally {
  await client.query(`DELETE FROM "User" WHERE "id" = ANY($1::text[])`, [ids]).catch(() => undefined);
  await client.end();
}
