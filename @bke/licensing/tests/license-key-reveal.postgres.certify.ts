import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { Client } from "pg";
import { createLicensingLicenseKeyRevealCapability } from "../logic/license-key-reveal";
import { createPostgresLicensingLicenseKeyRevealRepository } from "../prisma/repositories/postgres-license-key-reveal-repository";
import { createAesGcmLicensingLicenseKeyDecrypter } from "../providers/aes-gcm-license-key-decrypter";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required for Licensing PostgreSQL certification.");

const pepper = "licensing-cert-pepper";
const plaintextKey = "BKE-ABCDE-FGHIJ-KLMNO-PQRST";
const firstRevealAt = new Date("2026-09-02T01:00:00.000Z");
const laterRevealAt = new Date("2026-09-02T02:00:00.000Z");

function encryptLikeV1(value: string) {
  const encryptionKey = createHash("sha256").update(pepper).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

async function insertLicense(client: Client, input: {
  id: string;
  accountId: string;
  keyCiphertext: string | null;
}) {
  await client.query(
    `INSERT INTO "License" (
      "id", "publicId", "keyHash", "keyLastFour", "keyCiphertext",
      "accountId", "orderId", "orderItemId", "productId",
      "status", "maxSeats", "maxDevicesPerSeat"
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE',1,1)`,
    [
      input.id,
      `public-${input.id}`,
      `hash-${input.id}`,
      "QRST",
      input.keyCiphertext,
      input.accountId,
      `order-${input.id}`,
      `item-${input.id}`,
      `product-${input.id}`,
    ],
  );
}

const admin = new Client({ connectionString });
await admin.connect();
try {
  for (const foreignTable of [
    "CustomerAccount",
    "User",
    "Order",
    "OrderItem",
    "Product",
    "Edition",
    "PurchasePlan",
    "Subscription",
  ]) {
    const result = await admin.query<{ table_name: string | null }>(
      "SELECT to_regclass($1) AS table_name",
      [`public.\"${foreignTable}\"`],
    );
    if (result.rows[0]?.table_name !== null) {
      throw new Error(`Licensing certification unexpectedly found foreign table ${foreignTable}`);
    }
  }

  await insertLicense(admin, {
    id: "license-reveal",
    accountId: "account-1",
    keyCiphertext: encryptLikeV1(plaintextKey),
  });
  await insertLicense(admin, {
    id: "license-unavailable",
    accountId: "account-1",
    keyCiphertext: null,
  });
  await insertLicense(admin, {
    id: "license-fail",
    accountId: "account-1",
    keyCiphertext: encryptLikeV1(plaintextKey),
  });

  const repository = createPostgresLicensingLicenseKeyRevealRepository(connectionString);
  const decrypter = createAesGcmLicensingLicenseKeyDecrypter(pepper);
  const firstCapability = createLicensingLicenseKeyRevealCapability({
    repository,
    decrypter,
    clock: { now: () => firstRevealAt },
  });

  const wrongAccount = await firstCapability.reveal({
    licenseId: "license-reveal",
    accountId: "account-other",
    actorPrincipalId: "principal-1",
  });
  if (wrongAccount.status !== "REJECTED" || wrongAccount.code !== "NOT_FOUND") {
    throw new Error(`Wrong-account reveal was not scoped closed: ${JSON.stringify(wrongAccount)}`);
  }

  const unavailable = await firstCapability.reveal({
    licenseId: "license-unavailable",
    accountId: "account-1",
    actorPrincipalId: "principal-1",
  });
  if (unavailable.status !== "REJECTED" || unavailable.code !== "LICENSE_KEY_UNAVAILABLE") {
    throw new Error(`Unavailable key did not fail correctly: ${JSON.stringify(unavailable)}`);
  }

  const first = await firstCapability.reveal({
    licenseId: "license-reveal",
    accountId: "account-1",
    actorPrincipalId: "principal-1",
  });
  if (
    first.status !== "REVEALED" ||
    first.licenseKey !== plaintextKey ||
    !first.firstReveal ||
    first.keyRevealedAt.toISOString() !== firstRevealAt.toISOString()
  ) {
    throw new Error(`First reveal mismatch: ${JSON.stringify(first)}`);
  }

  const secondCapability = createLicensingLicenseKeyRevealCapability({
    repository,
    decrypter,
    clock: { now: () => laterRevealAt },
  });
  const second = await secondCapability.reveal({
    licenseId: "license-reveal",
    accountId: "account-1",
    actorPrincipalId: "principal-2",
  });
  if (
    second.status !== "REVEALED" ||
    second.licenseKey !== plaintextKey ||
    second.firstReveal ||
    second.keyRevealedAt.toISOString() !== firstRevealAt.toISOString()
  ) {
    throw new Error(`Repeat reveal did not preserve first timestamp: ${JSON.stringify(second)}`);
  }

  const stored = await admin.query<{ keyRevealedAt: Date | null }>(
    `SELECT "keyRevealedAt" FROM "License" WHERE "id" = 'license-reveal'`,
  );
  if (stored.rows[0]?.keyRevealedAt?.toISOString() !== firstRevealAt.toISOString()) {
    throw new Error("Stored keyRevealedAt did not preserve the first successful reveal timestamp.");
  }

  const events = await admin.query<{ type: string; metadata: { actorId?: string } }>(
    `SELECT "type", "metadata" FROM "LicenseEvent"
      WHERE "licenseId" = 'license-reveal' ORDER BY "createdAt" ASC`,
  );
  if (
    events.rowCount !== 2 ||
    events.rows.some((event) => event.type !== "CUSTOMER_REVEALED") ||
    events.rows[0]?.metadata.actorId !== "principal-1" ||
    events.rows[1]?.metadata.actorId !== "principal-2"
  ) {
    throw new Error(`Reveal events mismatch: ${JSON.stringify(events.rows)}`);
  }

  await admin.query(`
    CREATE OR REPLACE FUNCTION fail_license_reveal_event() RETURNS trigger AS $$
    BEGIN
      IF NEW."licenseId" = 'license-fail' AND NEW."type" = 'CUSTOMER_REVEALED' THEN
        RAISE EXCEPTION 'forced reveal event failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await admin.query(`
    CREATE TRIGGER force_license_reveal_event_failure
    BEFORE INSERT ON "LicenseEvent"
    FOR EACH ROW EXECUTE FUNCTION fail_license_reveal_event();
  `);

  let failed = false;
  try {
    await firstCapability.reveal({
      licenseId: "license-fail",
      accountId: "account-1",
      actorPrincipalId: "principal-fail",
    });
  } catch (error) {
    failed = error instanceof Error && error.message.includes("forced reveal event failure");
  }
  if (!failed) throw new Error("Forced LicenseEvent persistence failure did not surface.");

  const failedLicense = await admin.query<{ keyRevealedAt: Date | null }>(
    `SELECT "keyRevealedAt" FROM "License" WHERE "id" = 'license-fail'`,
  );
  const failedEvents = await admin.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM "LicenseEvent" WHERE "licenseId" = 'license-fail'`,
  );
  if (failedLicense.rows[0]?.keyRevealedAt !== null || failedEvents.rows[0]?.count !== "0") {
    throw new Error("Reveal persistence failure left partial Licensing state.");
  }

  console.log(
    "Licensing key reveal PostgreSQL GREEN: isolated account scope, V1 AES-GCM compatibility, repeat reveal timestamp preservation, event-per-reveal, and atomic rollback certified",
  );
} finally {
  await admin.end();
}
