import { Client } from "pg";
import type {
  IdentityMagicLoginConsumePersistenceResult,
  IdentityMagicLoginConsumeRepository,
  IdentityMagicLoginSessionRecord,
} from "../../logic/magic-login-consume-repository";
import type {
  IdentityIssuedSession,
  IdentitySessionAssuranceLevel,
  IdentitySessionAuthenticationMethod,
} from "../../contracts/session.contract";

type MagicLoginRow = {
  tokenId: string;
  identifier: string;
  purpose: string;
  expiresAt: Date;
  usedAt: Date | null;
  userId: string | null;
  role: "CUSTOMER" | "ADMIN" | null;
  suspendedAt: Date | null;
  lifecycleState: string | null;
};

type SessionRow = {
  id: string;
  userId: string;
  expiresAt: Date;
  lastAuthenticatedAt: Date;
  mfaVerifiedAt: Date | null;
  recentAuthenticatedAt: Date | null;
  lastSeenAt: Date;
  absoluteExpiresAt: Date;
  authenticationMethod: IdentitySessionAuthenticationMethod;
  assuranceLevel: IdentitySessionAssuranceLevel;
  createdAt: Date;
};

function toIssuedSession(row: SessionRow): IdentityIssuedSession {
  return {
    id: row.id,
    userId: row.userId,
    expiresAt: row.expiresAt,
    lastAuthenticatedAt: row.lastAuthenticatedAt,
    mfaVerifiedAt: row.mfaVerifiedAt,
    recentAuthenticatedAt: row.recentAuthenticatedAt,
    lastSeenAt: row.lastSeenAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    authenticationMethod: row.authenticationMethod,
    assuranceLevel: row.assuranceLevel,
    createdAt: row.createdAt,
  };
}

export function createPostgresIdentityMagicLoginConsumeRepository(
  connectionString: string,
): IdentityMagicLoginConsumeRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async consumeAndIssueSession(
      magicTokenHash: string,
      consumedAt: Date,
      session: IdentityMagicLoginSessionRecord,
    ): Promise<IdentityMagicLoginConsumePersistenceResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");

        const lookup = await client.query<MagicLoginRow>(
          `SELECT
             vt."id" AS "tokenId",
             vt."identifier",
             vt."purpose",
             vt."expiresAt",
             vt."usedAt",
             u."id" AS "userId",
             u."role",
             u."suspendedAt",
             u."lifecycleState"
           FROM "VerificationToken" vt
           LEFT JOIN "User" u ON u."email" = vt."identifier"
          WHERE vt."tokenHash" = $1
          LIMIT 1
          FOR UPDATE OF vt`,
          [magicTokenHash],
        );
        const row = lookup.rows[0];

        if (
          !row ||
          row.purpose !== "MAGIC_LOGIN" ||
          row.usedAt !== null ||
          row.expiresAt < consumedAt ||
          row.userId === null ||
          row.role === null
        ) {
          await client.query("ROLLBACK");
          return { status: "INVALID_TOKEN" as const };
        }

        if (row.role === "ADMIN") {
          await client.query("ROLLBACK");
          return {
            status: "ADMIN_PASSWORD_REQUIRED" as const,
            userId: row.userId,
          };
        }

        if (row.suspendedAt !== null || row.lifecycleState !== "ACTIVE") {
          await client.query("ROLLBACK");
          return { status: "ACCOUNT_NOT_ACTIVE" as const, userId: row.userId };
        }

        const consumed = await client.query(
          `UPDATE "VerificationToken"
              SET "usedAt" = $2
            WHERE "id" = $1
              AND "usedAt" IS NULL`,
          [row.tokenId, consumedAt],
        );
        if (consumed.rowCount !== 1) {
          await client.query("ROLLBACK");
          return { status: "INVALID_TOKEN" as const };
        }

        const created = await client.query<SessionRow>(
          `INSERT INTO "Session" (
             "id",
             "tokenHash",
             "userId",
             "expiresAt",
             "lastAuthenticatedAt",
             "mfaVerifiedAt",
             "recentAuthenticatedAt",
             "lastSeenAt",
             "absoluteExpiresAt",
             "userAgentSummary",
             "networkHint",
             "authenticationMethod",
             "assuranceLevel"
           ) VALUES (
             $1, $2, $3, $4, $5, NULL, NULL, $5, $4, $6, $7,
             'MAGIC_LINK'::"SessionAuthenticationMethod",
             'BASIC'::"SessionAssuranceLevel"
           )
           RETURNING
             "id",
             "userId",
             "expiresAt",
             "lastAuthenticatedAt",
             "mfaVerifiedAt",
             "recentAuthenticatedAt",
             "lastSeenAt",
             "absoluteExpiresAt",
             "authenticationMethod",
             "assuranceLevel",
             "createdAt"`,
          [
            session.id,
            session.tokenHash,
            row.userId,
            session.expiresAt,
            session.authenticatedAt,
            session.userAgentSummary,
            session.networkHint,
          ],
        );
        const createdSession = created.rows[0];
        if (!createdSession) {
          throw new Error("Identity magic-login session insert returned no row.");
        }

        await client.query("COMMIT");
        return {
          status: "AUTHENTICATED" as const,
          userId: row.userId,
          session: toIssuedSession(createdSession),
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}
