import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  IdentityFederatedProvider,
  IdentityVerifiedFederatedAssertion,
} from "../../contracts/federated-authentication.contract";
import type {
  IdentityLifecycleState,
  IdentityPrincipal,
  IdentityRole,
} from "../../contracts/identity.contract";
import type {
  IdentityFederatedAuthenticationRepository,
  IdentityFederatedBindingRecord,
  IdentityFederatedLinkResult,
} from "../../logic/federated-authentication-repository";

type LinkInput = Parameters<IdentityFederatedAuthenticationRepository["linkExistingByVerifiedEmail"]>[0];
type RecordAuthenticationInput = Parameters<IdentityFederatedAuthenticationRepository["recordAuthentication"]>[0];

type PrincipalRow = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: Date | null;
  role: IdentityRole;
  establishedAt: Date;
  suspendedAt: Date | null;
  lifecycleState: IdentityLifecycleState;
};

const projection = `
  SELECT
    u."id",
    u."email",
    u."name",
    u."emailVerified",
    u."role",
    u."createdAt" AS "establishedAt",
    u."suspendedAt",
    u."lifecycleState"
  FROM "User" u
`;

function principal(row: PrincipalRow): IdentityPrincipal {
  return Object.freeze({
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: row.emailVerified,
    role: row.role,
    establishedAt: row.establishedAt,
    suspendedAt: row.suspendedAt,
    lifecycleState: row.lifecycleState,
  });
}

export function createPostgresIdentityFederatedAuthenticationRepository(
  connectionString: string,
): IdentityFederatedAuthenticationRepository {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Identity PostgreSQL connection string is required.");

  return Object.freeze({
    async findByProviderSubject(
      provider: IdentityFederatedProvider,
      subject: string,
    ): Promise<IdentityFederatedBindingRecord | null> {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        const result = await client.query<PrincipalRow>(
          `${projection}
             INNER JOIN "ExternalIdentity" external_identity
                     ON external_identity."userId" = u."id"
            WHERE external_identity."provider" = $1::"IdentityFederatedProvider"
              AND external_identity."subject" = $2
            LIMIT 1`,
          [provider, subject],
        );
        const row = result.rows[0];
        return row ? Object.freeze({ principal: principal(row), provider, subject }) : null;
      } finally {
        await client.end();
      }
    },

    async findPrincipalByEmail(email: string): Promise<IdentityPrincipal | null> {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        const result = await client.query<PrincipalRow>(
          `${projection} WHERE lower(u."email") = lower($1) LIMIT 1`,
          [email],
        );
        return result.rows[0] ? principal(result.rows[0]) : null;
      } finally {
        await client.end();
      }
    },

    async linkExistingByVerifiedEmail(input: LinkInput): Promise<IdentityFederatedLinkResult> {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query<{ userId: string }>(
          `SELECT "userId"
             FROM "ExternalIdentity"
            WHERE ("provider" = $1::"IdentityFederatedProvider" AND "subject" = $2)
               OR ("provider" = $1::"IdentityFederatedProvider" AND "userId" = $3)
            FOR UPDATE`,
          [input.assertion.provider, input.assertion.subject, input.userId],
        );
        if (existing.rows.some((row) => row.userId !== input.userId)) {
          await client.query("ROLLBACK");
          return { status: "CONFLICT" };
        }

        if (existing.rowCount === 0) {
          await client.query(
            `INSERT INTO "ExternalIdentity" (
               "id", "provider", "subject", "userId", "emailAtLink", "emailVerifiedAtLink",
               "nameAtLink", "linkedAt", "lastAuthenticatedAt", "lastObservedEmail"
             ) VALUES ($1, $2::"IdentityFederatedProvider", $3, $4, $5, TRUE, $6, $7, $7, $5)`,
            [
              randomUUID(),
              input.assertion.provider,
              input.assertion.subject,
              input.userId,
              input.assertion.email,
              input.assertion.name ?? null,
              input.assertion.authenticatedAt,
            ],
          );
        } else {
          await client.query(
            `UPDATE "ExternalIdentity"
                SET "lastAuthenticatedAt" = $3,
                    "lastObservedEmail" = $4
              WHERE "provider" = $1::"IdentityFederatedProvider"
                AND "subject" = $2`,
            [
              input.assertion.provider,
              input.assertion.subject,
              input.assertion.authenticatedAt,
              input.assertion.email,
            ],
          );
        }

        await client.query(
          `UPDATE "User"
              SET "emailVerified" = COALESCE("emailVerified", $2),
                  "updatedAt" = GREATEST("updatedAt", $2)
            WHERE "id" = $1`,
          [input.userId, input.assertion.authenticatedAt],
        );

        const result = await client.query<PrincipalRow>(
          `${projection} WHERE u."id" = $1 LIMIT 1`,
          [input.userId],
        );
        const row = result.rows[0];
        if (!row) throw new Error("Identity principal disappeared during federation link.");
        await client.query("COMMIT");
        return {
          status: existing.rowCount === 0 ? "LINKED" : "EXISTING",
          principal: principal(row),
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if ((error as { code?: string }).code === "23505") return { status: "CONFLICT" };
        throw error;
      } finally {
        await client.end();
      }
    },

    async recordAuthentication(input: RecordAuthenticationInput) {
      const client = new Client({ connectionString: normalized });
      await client.connect();
      try {
        await client.query(
          `UPDATE "ExternalIdentity"
              SET "lastAuthenticatedAt" = GREATEST("lastAuthenticatedAt", $3),
                  "lastObservedEmail" = $4
            WHERE "provider" = $1::"IdentityFederatedProvider"
              AND "subject" = $2`,
          [input.provider, input.subject, input.authenticatedAt, input.email],
        );
      } finally {
        await client.end();
      }
    },
  });
}
