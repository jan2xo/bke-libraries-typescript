import { Client } from "pg";
import { createCommerceTrialGrantRegistryCapability } from "../logic/trial-grant-registry";
import { createPostgresCommerceTrialGrantRegistryRepository } from "../prisma/repositories/postgres-trial-grant-registry-repository";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Commerce trial grant certification.");

const client = new Client({ connectionString });
await client.connect();
try {
  const foreignTables = await client.query<{ name: string | null }>(
    `SELECT COALESCE(to_regclass('public."License"')::text, to_regclass('public."CustomerAccount"')::text, to_regclass('public."Product"')::text) AS name`,
  );
  if (foreignTables.rows[0]?.name !== null) {
    throw new Error("Commerce trial registry certification must not require foreign domain tables.");
  }

  const capability = createCommerceTrialGrantRegistryCapability(
    createPostgresCommerceTrialGrantRegistryRepository(connectionString),
  );
  const startsAt = new Date("2026-09-12T00:00:00Z");
  const trialEndsAt = new Date("2026-09-19T00:00:00Z");
  const graceEndsAt = new Date("2026-09-21T00:00:00Z");

  const first = await capability.record({
    accountId: "trial-cert-account",
    productId: "trial-cert-product",
    editionId: "trial-cert-edition",
    licenseId: "trial-cert-license-1",
    source: "SELF_SERVICE",
    selfServiceYear: 2026,
    trialStartsAt: startsAt,
    trialEndsAt,
    graceEndsAt,
    createdById: "trial-cert-user",
  });
  if (first.status !== "OK") throw new Error(`First self-service grant failed: ${JSON.stringify(first)}`);

  const eligibility = await capability.checkSelfServiceEligibility({
    accountId: "trial-cert-account",
    productId: "trial-cert-product",
    year: 2026,
  });
  if (eligibility.status !== "ALREADY_USED") {
    throw new Error(`Self-service eligibility did not observe persisted grant: ${JSON.stringify(eligibility)}`);
  }

  const duplicate = await capability.record({
    accountId: "trial-cert-account",
    productId: "trial-cert-product",
    editionId: "trial-cert-edition-2",
    licenseId: "trial-cert-license-2",
    source: "SELF_SERVICE",
    selfServiceYear: 2026,
    trialStartsAt: startsAt,
    trialEndsAt,
    graceEndsAt,
    createdById: "trial-cert-user",
  });
  if (duplicate.status !== "ALREADY_USED") {
    throw new Error(`Duplicate self-service grant was not rejected: ${JSON.stringify(duplicate)}`);
  }

  for (const suffix of ["a", "b"]) {
    const admin = await capability.record({
      accountId: "trial-cert-account",
      productId: "trial-cert-product",
      editionId: `trial-cert-admin-edition-${suffix}`,
      licenseId: `trial-cert-admin-license-${suffix}`,
      source: "ADMIN",
      trialStartsAt: startsAt,
      trialEndsAt,
      graceEndsAt,
      createdById: "trial-cert-admin",
    });
    if (admin.status !== "OK") {
      throw new Error(`Admin grant ${suffix} unexpectedly collided: ${JSON.stringify(admin)}`);
    }
  }

  const nextGraceEndsAt = new Date("2026-09-24T00:00:00Z");
  const grace = await capability.setGrace({ trialId: first.value.id, graceEndsAt: nextGraceEndsAt });
  if (grace.status !== "OK" || grace.value.graceEndsAt.getTime() !== nextGraceEndsAt.getTime()) {
    throw new Error(`Grace persistence failed: ${JSON.stringify(grace)}`);
  }

  const revokedAt = new Date("2026-09-13T00:00:00Z");
  const revoked = await capability.revoke({ trialId: first.value.id, revokedAt });
  if (revoked.status !== "OK" || revoked.value.revokedAt?.getTime() !== revokedAt.getTime()) {
    throw new Error(`Revoke persistence failed: ${JSON.stringify(revoked)}`);
  }
  const secondRevoke = await capability.revoke({
    trialId: first.value.id,
    revokedAt: new Date("2026-09-14T00:00:00Z"),
  });
  if (secondRevoke.status !== "OK" || secondRevoke.value.revokedAt?.getTime() !== revokedAt.getTime()) {
    throw new Error(`Revoke idempotence failed: ${JSON.stringify(secondRevoke)}`);
  }

  console.log("Commerce trial grant registry PostgreSQL certification GREEN");
} finally {
  await client.query(`DELETE FROM "TrialGrant" WHERE "accountId" = 'trial-cert-account'`).catch(() => undefined);
  await client.end();
}
