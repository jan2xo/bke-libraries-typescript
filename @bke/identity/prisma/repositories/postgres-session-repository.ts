import { Client } from "pg";
import type {
  IdentityIssuedSession,
  IdentitySessionAssuranceLevel,
  IdentitySessionAuthenticationMethod,
} from "../../contracts/session.contract";
import type {
  IdentityPersistedSessionContext,
  IdentitySessionPersistenceInput,
  IdentitySessionRepository,
  IdentitySessionRevocationReason,
} from "../../logic/session-repository";

type PrincipalStateRow = {
  role: "CUSTOMER" | "ADMIN";
  suspendedAt: Date | null;
  lifecycleState: string;
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

type SessionValidationRow = SessionRow & {
  revokedAt: Date | null;
  userEmail: string;
  userName: string | null;
  userEmailVerified: Date | null;
  userRole: "CUSTOMER" | "ADMIN";
  userEstablishedAt: Date;
  userSuspendedAt: Date | null;
  userLifecycleState:
    | "ACTIVE"
    | "SUSPENDED"
    | "CLOSURE_REQUESTED"
    | "CLOSED"
    | "PRIVACY_REVIEW"
    | "PSEUDONYMIZED"
    | "PURGE_ELIGIBLE";
  administratorMfaEnabled: boolean;
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

function toPersistedSessionContext(
  row: SessionValidationRow,
): IdentityPersistedSessionContext {
  return {
    session: toIssuedSession(row),
    principal: {
      id: row.userId,
      email: row.userEmail,
      name: row.userName,
      emailVerified: row.userEmailVerified,
      role: row.userRole,
      establishedAt: row.userEstablishedAt,
      suspendedAt: row.userSuspendedAt,
      lifecycleState: row.userLifecycleState,
    },
    administratorMfaEnabled: row.administratorMfaEnabled,
    revokedAt: row.revokedAt,
  };
}

export function createPostgresIdentitySessionRepository(
  connectionString: string,
): IdentitySessionRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Identity PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async issueSession(input: IdentitySessionPersistenceInput) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();

      try {
        await client.query("BEGIN");

        const principal = await client.query<PrincipalStateRow>(
          `SELECT "role", "suspendedAt", "lifecycleState"
             FROM "User"
            WHERE "id" = $1
            LIMIT 1`,
          [input.userId],
        );
        const state = principal.rows[0];

        if (!state) {
          await client.query("ROLLBACK");
          return { status: "PRINCIPAL_NOT_FOUND" as const };
        }

        if (
          state.role !== "ADMIN" &&
          (state.suspendedAt !== null || state.lifecycleState !== "ACTIVE")
        ) {
          await client.query("ROLLBACK");
          return { status: "ACCOUNT_NOT_ACTIVE" as const };
        }

        const result = await client.query<SessionRow>(
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
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             $12::"SessionAuthenticationMethod",
             $13::"SessionAssuranceLevel"
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
            input.id,
            input.tokenHash,
            input.userId,
            input.expiresAt,
            input.lastAuthenticatedAt,
            input.mfaVerifiedAt,
            input.recentAuthenticatedAt,
            input.lastSeenAt,
            input.absoluteExpiresAt,
            input.userAgentSummary,
            input.networkHint,
            input.authenticationMethod,
            input.assuranceLevel,
          ],
        );

        await client.query("COMMIT");
        const session = result.rows[0];
        if (!session) throw new Error("Identity session insert returned no row.");
        return { status: "CREATED" as const, session: toIssuedSession(session) };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },

    async findSessionByTokenHash(tokenHash: string) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        const result = await client.query<SessionValidationRow>(
          `SELECT
             s."id",
             s."userId",
             s."expiresAt",
             s."lastAuthenticatedAt",
             s."mfaVerifiedAt",
             s."recentAuthenticatedAt",
             s."lastSeenAt",
             s."absoluteExpiresAt",
             s."authenticationMethod",
             s."assuranceLevel",
             s."createdAt",
             s."revokedAt",
             u."email" AS "userEmail",
             u."name" AS "userName",
             u."emailVerified" AS "userEmailVerified",
             u."role" AS "userRole",
             u."createdAt" AS "userEstablishedAt",
             u."suspendedAt" AS "userSuspendedAt",
             u."lifecycleState" AS "userLifecycleState",
             (mfa."enabledAt" IS NOT NULL) AS "administratorMfaEnabled"
           FROM "Session" s
           JOIN "User" u ON u."id" = s."userId"
           LEFT JOIN "AdministratorMfaMethod" mfa ON mfa."userId" = u."id"
          WHERE s."tokenHash" = $1
          LIMIT 1`,
          [tokenHash],
        );
        const row = result.rows[0];
        return row ? toPersistedSessionContext(row) : null;
      } finally {
        await client.end();
      }
    },

    async revokeSession(sessionId: string, reason: IdentitySessionRevocationReason, revokedAt: Date) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query(
          `UPDATE "Session"
              SET "revokedAt" = $2,
                  "revocationReason" = $3
            WHERE "id" = $1
              AND "revokedAt" IS NULL`,
          [sessionId, revokedAt, reason],
        );
      } finally {
        await client.end();
      }
    },

    async touchLastSeen(sessionId: string, lastSeenAt: Date) {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query(
          `UPDATE "Session"
              SET "lastSeenAt" = $2
            WHERE "id" = $1
              AND "revokedAt" IS NULL`,
          [sessionId, lastSeenAt],
        );
      } finally {
        await client.end();
      }
    },
  });
}
