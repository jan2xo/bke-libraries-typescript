import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { CommercialSigningKeyProvider } from "../../logic/commercial-lease-ports";
import {
  selectActiveCommercialSigningKey,
  type CommercialSigningKeyBootstrap,
  type CommercialSigningKeyRecord,
} from "../../logic/commercial-signing-registry";

type SigningKeyRow = {
  id: string;
  keyId: string;
  algorithm: string;
  status: string;
  publicKey: string;
  privateKeyReference: string;
  createdAt: Date;
  activatedAt: Date;
  retiredAt: Date | null;
  rotationReason: string | null;
  createdBy: string | null;
};

function mapRow(row: SigningKeyRow): CommercialSigningKeyRecord {
  return Object.freeze({ ...row });
}

export function createPostgresCommercialSigningKeyProvider(
  connectionString: string,
  bootstrap?: CommercialSigningKeyBootstrap,
): CommercialSigningKeyProvider {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Licensing PostgreSQL connection string is required.");

  async function activeRows(): Promise<CommercialSigningKeyRecord[]> {
    const client = new Client({ connectionString: normalized });
    await client.connect();
    try {
      const result = await client.query<SigningKeyRow>(
        `SELECT "id", "keyId", "algorithm", "status", "publicKey", "privateKeyReference",
                "createdAt", "activatedAt", "retiredAt", "rotationReason", "createdBy"
           FROM "CommercialSigningKey"
          WHERE "status" = 'ACTIVE'
          ORDER BY "activatedAt" ASC, "keyId" ASC`,
      );
      return result.rows.map(mapRow);
    } finally {
      await client.end();
    }
  }

  return Object.freeze({
    async ensure(): Promise<void> {
      const existing = await activeRows();
      if (existing.length > 0) return;
      if (!bootstrap) throw new Error("LEASE_SIGNING_NOT_CONFIGURED");

      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        await client.query(
          `INSERT INTO "CommercialSigningKey"
            ("id", "keyId", "algorithm", "status", "publicKey", "privateKeyReference")
           VALUES ($1, $2, 'Ed25519', 'ACTIVE', $3, $4)
           ON CONFLICT ("keyId") DO NOTHING`,
          [randomUUID(), bootstrap.keyId, bootstrap.publicKey, bootstrap.privateKeyReference],
        );
      } finally {
        await client.end();
      }
    },

    async active(): Promise<CommercialSigningKeyRecord> {
      return selectActiveCommercialSigningKey(await activeRows());
    },
  });
}
