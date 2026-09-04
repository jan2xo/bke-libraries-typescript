import { Client } from "pg";
import type { CommercialSigningKeyProvider } from "../../logic/commercial-lease-ports";
import type { CommercialSigningKeyRecord } from "../../logic/commercial-signing-registry";

interface SigningKeyRow {
  keyId: string;
  privateKeyReference: string;
  algorithm: string;
  status: string;
  activeFrom: Date;
  activeTo: Date | null;
  revokedAt: Date | null;
}

function mapRow(row: SigningKeyRow | undefined): CommercialSigningKeyRecord {
  if (!row) throw new Error("COMMERCIAL_SIGNING_KEY_UNAVAILABLE");
  return Object.freeze({
    keyId: row.keyId,
    privateKeyReference: row.privateKeyReference,
    algorithm: row.algorithm,
    status: row.status,
    activeFrom: row.activeFrom,
    activeTo: row.activeTo,
    revokedAt: row.revokedAt,
  });
}

export function createPostgresCommercialSigningKeyProvider(
  connectionString: string,
): CommercialSigningKeyProvider {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Licensing PostgreSQL connection string is required.");

  const query = async (sql: string, values: readonly unknown[]) => {
    const client = new Client({ connectionString: normalized });
    await client.connect();
    try {
      return await client.query<SigningKeyRow>(sql, [...values]);
    } finally {
      await client.end();
    }
  };

  return Object.freeze({
    async active(now: Date) {
      const result = await query(
        `SELECT "keyId", "privateKeyReference", "algorithm", "status", "activeFrom", "activeTo", "revokedAt"
           FROM "CommercialSigningKey"
          WHERE "status" = 'ACTIVE'
            AND "revokedAt" IS NULL
            AND "activeFrom" <= $1
            AND ("activeTo" IS NULL OR "activeTo" > $1)
          ORDER BY "activeFrom" DESC
          LIMIT 1`,
        [now],
      );
      return mapRow(result.rows[0]);
    },

    async resolve(keyId: string, now: Date) {
      const result = await query(
        `SELECT "keyId", "privateKeyReference", "algorithm", "status", "activeFrom", "activeTo", "revokedAt"
           FROM "CommercialSigningKey"
          WHERE "keyId" = $1
            AND "status" = 'ACTIVE'
            AND "revokedAt" IS NULL
            AND "activeFrom" <= $2
            AND ("activeTo" IS NULL OR "activeTo" > $2)
          LIMIT 1`,
        [keyId, now],
      );
      return mapRow(result.rows[0]);
    },
  });
}
