import { Client } from "pg";
import type { AccountsMemberRole } from "../../contracts/account.contract";
import type {
  AccountsInvitationAcceptanceRepository,
  AccountsInvitationAcceptanceRepositoryInput,
  AccountsInvitationAcceptanceRepositoryResult,
} from "../../logic/invitation-acceptance-repository";

interface ClaimedInvitationRow {
  readonly id: string;
  readonly accountId: string;
  readonly role: AccountsMemberRole;
}

export function createPostgresAccountsInvitationAcceptanceRepository(
  connectionString: string,
): AccountsInvitationAcceptanceRepository {
  const normalizedConnectionString = connectionString.trim();
  if (!normalizedConnectionString) {
    throw new Error("Accounts PostgreSQL connection string is required.");
  }

  return Object.freeze({
    async accept(
      input: AccountsInvitationAcceptanceRepositoryInput,
    ): Promise<AccountsInvitationAcceptanceRepositoryResult> {
      const client = new Client({ connectionString: normalizedConnectionString });
      await client.connect();
      try {
        await client.query("BEGIN");
        const claimed = await client.query<ClaimedInvitationRow>(
          `UPDATE "Invitation"
              SET "status" = 'ACCEPTED'
            WHERE "tokenHash" = $1
              AND "status" = 'PENDING'
              AND "expiresAt" > $2
              AND "email" = $3
            RETURNING "id", "accountId", "role"`,
          [input.tokenHash, input.now, input.email],
        );

        if (claimed.rowCount !== 1 || !claimed.rows[0]) {
          const existing = await client.query<{
            status: string;
            expiresAt: Date;
            email: string;
          }>(
            `SELECT "status", "expiresAt", "email"
               FROM "Invitation"
              WHERE "tokenHash" = $1`,
            [input.tokenHash],
          );
          await client.query("ROLLBACK");
          const invitation = existing.rows[0];
          if (!invitation) return { status: "REJECTED", code: "INVITATION_NOT_FOUND" };
          if (invitation.status !== "PENDING") {
            return { status: "REJECTED", code: "INVITATION_NOT_PENDING" };
          }
          if (invitation.expiresAt <= input.now) {
            return { status: "REJECTED", code: "INVITATION_EXPIRED" };
          }
          if (invitation.email !== input.email) {
            return { status: "REJECTED", code: "INVITATION_EMAIL_MISMATCH" };
          }
          return { status: "REJECTED", code: "INVITATION_NOT_PENDING" };
        }

        const invitation = claimed.rows[0];
        const accountResult = await client.query<{ type: string; lifecycleState: string }>(
          `SELECT "type", "lifecycleState"
             FROM "CustomerAccount"
            WHERE "id" = $1`,
          [invitation.accountId],
        );
        const account = accountResult.rows[0];
        if (!account) throw new Error("Invitation account is missing.");
        if (account.type !== "ORGANIZATION") {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "ACCOUNT_NOT_ORGANIZATION" };
        }
        if (account.lifecycleState === "CLOSED" || account.lifecycleState === "CLOSURE_REQUESTED") {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "CLOSED_ACCOUNT" };
        }
        if (account.lifecycleState === "SUSPENDED") {
          await client.query("ROLLBACK");
          return { status: "REJECTED", code: "SUSPENDED_ACCOUNT" };
        }

        const membership = await client.query<{
          accountId: string;
          userId: string;
          role: AccountsMemberRole;
          createdAt: Date;
        }>(
          `INSERT INTO "Membership" ("accountId", "userId", "role")
           VALUES ($1, $2, $3)
           ON CONFLICT ("accountId", "userId")
           DO UPDATE SET "role" = EXCLUDED."role"
           RETURNING "accountId", "userId", "role", "createdAt"`,
          [invitation.accountId, input.principalId, invitation.role],
        );
        if (!membership.rows[0]) throw new Error("Membership upsert returned no row.");

        await client.query("COMMIT");
        return {
          status: "ACCEPTED",
          invitationId: invitation.id,
          membership: membership.rows[0],
        };
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original persistence failure.
        }
        throw error;
      } finally {
        await client.end();
      }
    },
  });
}
