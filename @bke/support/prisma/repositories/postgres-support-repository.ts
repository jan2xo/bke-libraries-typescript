import { Client, type PoolClient } from "pg";
import type {
  SupportEventSnapshot,
  SupportMessageSnapshot,
  SupportMessageVisibility,
  SupportSafeObject,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketSnapshot,
  SupportTicketState,
} from "../../contracts/support.contract";
import type { SupportAdminUpdatePersistenceInput, SupportCreatePersistenceInput, SupportCustomerReplyPersistenceInput, SupportCustomerReplyPersistenceResult, SupportRepository } from "../../logic/support-repository";

type Queryable = Pick<Client, "query"> | Pick<PoolClient, "query">;
type TicketRow = {
  id: string; publicId: string; createdById: string; accountId: string; orderId: string | null; licenseId: string | null;
  category: string; state: string; priority: string; subject: string; safeContext: unknown; securityReport: boolean; assignedToId: string | null;
  lastCustomerReplyAt: Date | string | null; lastAdminReplyAt: Date | string | null; escalatedAt: Date | string | null; resolvedAt: Date | string | null; closedAt: Date | string | null;
  createdAt: Date | string; updatedAt: Date | string;
};
type MessageRow = { id: string; ticketId: string; authorId: string; body: string; visibility: string; createdAt: Date | string };
type EventRow = { id: string; ticketId: string; actorId: string | null; eventType: string; metadata: unknown; createdAt: Date | string };
const categories = new Set(["ACCOUNT","PAYMENT","REFUND","INVOICE","LICENSE","DEVICE","DOWNLOAD","SECURITY","FEATURE_REQUEST","OTHER"]);
const states = new Set(["OPEN","TRIAGED","WAITING_ON_CUSTOMER","WAITING_ON_SUPPORT","ESCALATED","RESOLVED","CLOSED"]);
const priorities = new Set(["LOW","NORMAL","HIGH","URGENT"]);
const visibilities = new Set(["PUBLIC","INTERNAL"]);
const date = (value: Date | string | null): Date | null => value === null ? null : new Date(value);
const object = (value: unknown): SupportSafeObject => Object.freeze(value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {});

function message(row: MessageRow): SupportMessageSnapshot {
  if (!visibilities.has(row.visibility)) throw new Error(`Unknown support message visibility: ${row.visibility}`);
  return Object.freeze({ ...row, visibility: row.visibility as SupportMessageVisibility, createdAt: new Date(row.createdAt) });
}
function event(row: EventRow): SupportEventSnapshot { return Object.freeze({ ...row, metadata: object(row.metadata), createdAt: new Date(row.createdAt) }); }

async function snapshot(client: Queryable, row: TicketRow, includeInternal: boolean): Promise<SupportTicketSnapshot> {
  if (!categories.has(row.category) || !states.has(row.state) || !priorities.has(row.priority)) throw new Error("Unknown support ticket enum value.");
  const messages = await client.query<MessageRow>(`SELECT * FROM "SupportTicketMessage" WHERE "ticketId" = $1 ${includeInternal ? "" : `AND "visibility" = 'PUBLIC'`} ORDER BY "createdAt" ASC`, [row.id]);
  const events = includeInternal ? await client.query<EventRow>(`SELECT * FROM "SupportTicketEvent" WHERE "ticketId" = $1 ORDER BY "createdAt" ASC`, [row.id]) : null;
  const value: SupportTicketSnapshot = {
    id: row.id, publicId: row.publicId, createdById: row.createdById, accountId: row.accountId, orderId: row.orderId, licenseId: row.licenseId,
    category: row.category as SupportTicketCategory, state: row.state as SupportTicketState, priority: row.priority as SupportTicketPriority,
    subject: row.subject, safeContext: object(row.safeContext), securityReport: row.securityReport,
    ...(includeInternal ? { assignedToId: row.assignedToId } : {}),
    lastCustomerReplyAt: date(row.lastCustomerReplyAt), lastAdminReplyAt: date(row.lastAdminReplyAt), escalatedAt: date(row.escalatedAt), resolvedAt: date(row.resolvedAt), closedAt: date(row.closedAt),
    createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt), messages: Object.freeze(messages.rows.map(message)), ...(events ? { events: Object.freeze(events.rows.map(event)) } : {}),
  };
  return Object.freeze(value);
}

export function createPostgresSupportRepository(connectionString: string): SupportRepository {
  const normalized = connectionString.trim();
  if (!normalized) throw new Error("Support PostgreSQL connection string is required.");
  async function withClient<T>(operation: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: normalized }); await client.connect();
    try { return await operation(client); } finally { await client.end(); }
  }
  async function load(client: Queryable, ticketId: string, includeInternal: boolean): Promise<SupportTicketSnapshot | null> {
    const result = await client.query<TicketRow>(`SELECT * FROM "SupportTicket" WHERE "id" = $1`, [ticketId]);
    return result.rowCount === 1 ? snapshot(client, result.rows[0]!, includeInternal) : null;
  }
  return Object.freeze({
    async createTicket(input: SupportCreatePersistenceInput) {
      return withClient(async (client) => {
        await client.query("BEGIN");
        try {
          await client.query(`INSERT INTO "SupportTicket" ("id","publicId","createdById","accountId","orderId","licenseId","category","state","priority","subject","safeContext","securityReport","lastCustomerReplyAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN',$8,$9,$10::jsonb,$11,$12,$12,$12)`, [input.ticketId,input.publicId,input.userId,input.accountId,input.orderId,input.licenseId,input.category,input.priority,input.subject,JSON.stringify(input.safeContext),input.securityReport,input.now]);
          await client.query(`INSERT INTO "SupportTicketMessage" ("id","ticketId","authorId","body","visibility","createdAt") VALUES ($1,$2,$3,$4,'PUBLIC',$5)`, [input.messageId,input.ticketId,input.userId,input.body,input.now]);
          await client.query(`INSERT INTO "SupportTicketEvent" ("id","ticketId","actorId","eventType","metadata","createdAt") VALUES ($1,$2,$3,$4,$5::jsonb,$6)`, [input.eventId,input.ticketId,input.userId,input.eventType,JSON.stringify(input.eventMetadata),input.now]);
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        const value = await load(client, input.ticketId, true); if (!value) throw new Error("Support ticket disappeared after creation."); return value;
      });
    },
    async customerReply(input: SupportCustomerReplyPersistenceInput): Promise<SupportCustomerReplyPersistenceResult> {
      return withClient(async (client) => {
        await client.query("BEGIN");
        try {
          const found = await client.query<Pick<TicketRow,"id"|"state"> & { accountId: string; createdById: string }>(`SELECT "id","state","accountId","createdById" FROM "SupportTicket" WHERE "id" = $1 FOR UPDATE`, [input.ticketId]);
          if (found.rowCount !== 1 || (found.rows[0]!.createdById !== input.userId && !input.accessibleAccountIds.includes(found.rows[0]!.accountId))) { await client.query("ROLLBACK"); return { status: "NOT_FOUND" }; }
          if (found.rows[0]!.state === "RESOLVED" || found.rows[0]!.state === "CLOSED") { await client.query("ROLLBACK"); return { status: "INVALID_STATE" }; }
          await client.query(`INSERT INTO "SupportTicketMessage" ("id","ticketId","authorId","body","visibility","createdAt") VALUES ($1,$2,$3,$4,'PUBLIC',$5)`, [input.messageId,input.ticketId,input.userId,input.body,input.now]);
          await client.query(`UPDATE "SupportTicket" SET "state"='WAITING_ON_SUPPORT',"lastCustomerReplyAt"=$2,"updatedAt"=$2 WHERE "id"=$1`, [input.ticketId,input.now]);
          await client.query(`INSERT INTO "SupportTicketEvent" ("id","ticketId","actorId","eventType","metadata","createdAt") VALUES ($1,$2,$3,'CUSTOMER_REPLIED','{}'::jsonb,$4)`, [input.eventId,input.ticketId,input.userId,input.now]);
          await client.query("COMMIT");
          const value = await load(client,input.ticketId,false); if (!value) throw new Error("Support ticket disappeared after customer reply."); return { status:"OK", value };
        } catch (error) { await client.query("ROLLBACK"); throw error; }
      });
    },
    async adminUpdate(input: SupportAdminUpdatePersistenceInput) {
      return withClient(async (client) => {
        await client.query("BEGIN");
        try {
          const found = await client.query<TicketRow>(`SELECT * FROM "SupportTicket" WHERE "id"=$1 FOR UPDATE`,[input.ticketId]);
          if (found.rowCount !== 1) { await client.query("ROLLBACK"); return null; }
          if (input.body && input.publicMessageId) await client.query(`INSERT INTO "SupportTicketMessage" ("id","ticketId","authorId","body","visibility","createdAt") VALUES ($1,$2,$3,$4,'PUBLIC',$5)`,[input.publicMessageId,input.ticketId,input.adminId,input.body,input.now]);
          if (input.internalNote && input.internalMessageId) await client.query(`INSERT INTO "SupportTicketMessage" ("id","ticketId","authorId","body","visibility","createdAt") VALUES ($1,$2,$3,$4,'INTERNAL',$5)`,[input.internalMessageId,input.ticketId,input.adminId,input.internalNote,input.now]);
          const fields:string[]=[`"updatedAt"=$2`]; const values:unknown[]=[input.ticketId,input.now];
          const push=(column:string,value:unknown)=>{ values.push(value); fields.push(`"${column}"=$${values.length}`); };
          if(input.state!==undefined){ push("state",input.state); if(input.state==="RESOLVED") push("resolvedAt",input.now); if(input.state==="CLOSED") push("closedAt",input.now); if(input.state==="ESCALATED") push("escalatedAt",input.now); }
          if(input.priority!==undefined) push("priority",input.priority);
          if(input.assignedToId!==undefined) push("assignedToId",input.assignedToId);
          if(input.body) push("lastAdminReplyAt",input.now);
          await client.query(`UPDATE "SupportTicket" SET ${fields.join(",")} WHERE "id"=$1`,values);
          await client.query(`INSERT INTO "SupportTicketEvent" ("id","ticketId","actorId","eventType","metadata","createdAt") VALUES ($1,$2,$3,'ADMIN_UPDATED',$4::jsonb,$5)`,[input.eventId,input.ticketId,input.adminId,JSON.stringify(input.eventMetadata),input.now]);
          await client.query("COMMIT");
          return load(client,input.ticketId,true);
        } catch(error){ await client.query("ROLLBACK"); throw error; }
      });
    },
    async listCustomerTickets(input) {
      return withClient(async (client) => {
        const rows=await client.query<TicketRow>(`SELECT * FROM "SupportTicket" WHERE "createdById"=$1 OR "accountId"=ANY($2::text[]) ORDER BY "updatedAt" DESC LIMIT $3`,[input.userId,[...input.accessibleAccountIds],input.limit]);
        const values:SupportTicketSnapshot[]=[]; for(const row of rows.rows) values.push(await snapshot(client,row,false)); return Object.freeze(values);
      });
    },
    async listAdminTickets(limit) {
      return withClient(async (client) => {
        const rows=await client.query<TicketRow>(`SELECT * FROM "SupportTicket" ORDER BY "securityReport" DESC,"priority" DESC,"updatedAt" DESC LIMIT $1`,[limit]);
        const values:SupportTicketSnapshot[]=[]; for(const row of rows.rows) values.push(await snapshot(client,row,true)); return Object.freeze(values);
      });
    },
  } satisfies SupportRepository);
}
