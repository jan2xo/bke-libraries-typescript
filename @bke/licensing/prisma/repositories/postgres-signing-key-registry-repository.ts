import { Client } from "pg";
import type {
  LicensingSigningKeyActiveSnapshot,
  LicensingSigningKeyPublicSnapshot,
  LicensingSigningKeyRegistryCapability,
  LicensingSigningKeyStatus,
} from "../../contracts/signing-key-registry.contract";
import type { CommercialSigningKeyBootstrap } from "../../logic/commercial-signing-registry";
import { createPostgresCommercialSigningKeyProvider } from "./postgres-commercial-signing-key-provider";

type PublicSigningKeyRow = {
  keyId: string;
  algorithm: string;
  publicKey: string;
  status: LicensingSigningKeyStatus;
  activatedAt: Date;
  retiredAt: Date | null;
};

export function createPostgresLicensingSigningKeyRegistryCapability(
  connectionString: string,
  bootstrap?: CommercialSigningKeyBootstrap,
): LicensingSigningKeyRegistryCapability {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Licensing PostgreSQL connection string is required.");
  const signingKeys = createPostgresCommercialSigningKeyProvider(normalized, bootstrap);

  return Object.freeze({
    ensure: () => signingKeys.ensure(),
    async active(): Promise<LicensingSigningKeyActiveSnapshot> {
      const key = await signingKeys.active();
      return Object.freeze({
        keyId: key.keyId,
        algorithm: key.algorithm,
        publicKey: key.publicKey,
        status: "ACTIVE" as const,
        activatedAt: new Date(key.activatedAt),
        retiredAt: key.retiredAt ? new Date(key.retiredAt) : null,
        privateKeyReference: key.privateKeyReference,
      });
    },
    async listPublic(): Promise<readonly LicensingSigningKeyPublicSnapshot[]> {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        const result = await client.query<PublicSigningKeyRow>(
          `SELECT "keyId", "algorithm", "publicKey", "status", "activatedAt", "retiredAt"
             FROM "CommercialSigningKey"
            WHERE "status" IN ('ACTIVE', 'RETIRED')
            ORDER BY "createdAt" ASC, "keyId" ASC`,
        );
        return Object.freeze(result.rows.map((row) => Object.freeze({
          keyId: row.keyId,
          algorithm: row.algorithm,
          publicKey: row.publicKey,
          status: row.status,
          activatedAt: new Date(row.activatedAt),
          retiredAt: row.retiredAt ? new Date(row.retiredAt) : null,
        })));
      } finally {
        await client.end();
      }
    },
  });
}
