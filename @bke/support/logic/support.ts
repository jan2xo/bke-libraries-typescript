import { randomUUID } from "node:crypto";
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATES,
  type SupportAdminUpdateInput,
  type SupportCommandCapability,
  type SupportCommandResult,
  type SupportContextPort,
  type SupportCreateTicketInput,
  type SupportCustomerListInput,
  type SupportCustomerReplyInput,
  type SupportEffect,
  type SupportQueryCapability,
  type SupportQueryResult,
  type SupportTicketSnapshot,
} from "../contracts/support.contract";
import { redactSupportObject } from "./redaction";
import type { SupportRepository } from "./support-repository";

const categorySet = new Set<string>(SUPPORT_TICKET_CATEGORIES);
const prioritySet = new Set<string>(SUPPORT_TICKET_PRIORITIES);
const stateSet = new Set<string>(SUPPORT_TICKET_STATES);

export function supportPublicId(now = new Date(), random = randomUUID()): string {
  return `BKE-SUP-${now.getUTCFullYear()}-${random.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function text(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}
function id(value: unknown): value is string { return text(value, 1, 256); }
function email(value: unknown): value is string { return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()); }
function ids(values: readonly string[]): readonly string[] { return Object.freeze([...new Set(values.filter(id))]); }
function limit(value: number | undefined, fallback: number, maximum: number): number | null {
  if (value === undefined) return fallback;
  return Number.isInteger(value) && value >= 1 && value <= maximum ? value : null;
}
function persistenceFailure<T>(): SupportCommandResult<T> { return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" }; }

export function createSupportCommandCapability(input: {
  readonly repository: SupportRepository;
  readonly context: SupportContextPort;
  readonly now?: () => Date;
  readonly randomId?: () => string;
}): SupportCommandCapability {
  const now = input.now ?? (() => new Date());
  const randomId = input.randomId ?? randomUUID;

  return Object.freeze({
    async createTicket(command: SupportCreateTicketInput): Promise<SupportCommandResult<SupportTicketSnapshot>> {
      if (!id(command.userId) || !id(command.accountId) || !categorySet.has(command.category) || !text(command.subject, 3, 160) || !text(command.body, 5, 8000) || !email(command.supportNotificationRecipient) || (command.priority !== undefined && !prioritySet.has(command.priority)) || (command.orderId != null && !id(command.orderId)) || (command.licenseId != null && !id(command.licenseId))) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }
      const context = await input.context.resolve({ userId: command.userId, accountId: command.accountId, orderId: command.orderId, licenseId: command.licenseId });
      if (context.status === "FAILED") return { status: "FAILED", code: "CONTEXT_UNAVAILABLE" };
      if (context.status === "REJECTED") return { status: "REJECTED", code: context.code };
      const at = now();
      const ticketId = randomId();
      const publicId = supportPublicId(at, randomId());
      const securityReport = command.category === "SECURITY";
      const priority = securityReport ? "URGENT" : command.priority ?? "NORMAL";
      const safeContext = redactSupportObject(context.safeContext);
      const eventMetadata = redactSupportObject({ category: command.category, priority, publicId });
      try {
        const value = await input.repository.createTicket({
          ticketId,
          publicId,
          messageId: randomId(),
          eventId: randomId(),
          userId: command.userId,
          accountId: command.accountId,
          orderId: command.orderId ?? null,
          licenseId: command.licenseId ?? null,
          category: command.category,
          priority,
          subject: command.subject.trim(),
          body: command.body.trim(),
          safeContext,
          securityReport,
          eventType: securityReport ? "SECURITY_REPORT_CREATED" : "TICKET_CREATED",
          eventMetadata,
          now: at,
        });
        const effects: readonly SupportEffect[] = Object.freeze([
          Object.freeze({ kind: "AUDIT", actorId: command.userId, accountId: command.accountId, action: securityReport ? "SUPPORT_SECURITY_REPORT_CREATED" : "SUPPORT_TICKET_CREATED", targetType: "SupportTicket", targetId: value.id, metadata: eventMetadata }),
          Object.freeze({ kind: "NOTIFICATION", messageType: "SUPPORT_TICKET_OPENED", recipient: command.supportNotificationRecipient.trim(), subject: `Support ticket ${value.publicId}: ${value.subject}`, deduplicationKey: `support-opened:${value.id}`, payload: redactSupportObject({ ticketPublicId: value.publicId, category: value.category, priority: value.priority, securityReport }) }),
        ]);
        return { status: "OK", value, effects };
      } catch { return persistenceFailure(); }
    },

    async customerReply(command: SupportCustomerReplyInput): Promise<SupportCommandResult<SupportTicketSnapshot>> {
      if (!id(command.userId) || !id(command.ticketId) || !text(command.body, 1, 8000) || !Array.isArray(command.accessibleAccountIds)) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const result = await input.repository.customerReply({ messageId: randomId(), eventId: randomId(), userId: command.userId, ticketId: command.ticketId, accessibleAccountIds: ids(command.accessibleAccountIds), body: command.body.trim(), now: now() });
        if (result.status === "NOT_FOUND") return { status: "NOT_FOUND" };
        if (result.status === "INVALID_STATE") return { status: "REJECTED", code: "INVALID_STATE" };
        return { status: "OK", value: result.value, effects: Object.freeze([]) };
      } catch { return persistenceFailure(); }
    },

    async adminUpdate(command: SupportAdminUpdateInput): Promise<SupportCommandResult<SupportTicketSnapshot>> {
      if (!id(command.adminId) || !id(command.ticketId) || (command.body !== undefined && !text(command.body, 1, 8000)) || (command.internalNote !== undefined && !text(command.internalNote, 1, 8000)) || (command.state !== undefined && !stateSet.has(command.state)) || (command.priority !== undefined && !prioritySet.has(command.priority)) || (command.assignedToId !== undefined && command.assignedToId !== null && !id(command.assignedToId)) || (command.body !== undefined && !email(command.customerEmail))) return { status: "FAILED", code: "INVALID_INPUT" };
      const at = now();
      const eventMetadata = redactSupportObject({ state: command.state, priority: command.priority, assigned: command.assignedToId !== undefined });
      try {
        const value = await input.repository.adminUpdate({ publicMessageId: command.body ? randomId() : null, internalMessageId: command.internalNote ? randomId() : null, eventId: randomId(), adminId: command.adminId, ticketId: command.ticketId, body: command.body?.trim(), internalNote: command.internalNote?.trim(), state: command.state, priority: command.priority, assignedToId: command.assignedToId, eventMetadata, now: at });
        if (!value) return { status: "NOT_FOUND" };
        const effects: SupportEffect[] = [Object.freeze({ kind: "AUDIT", actorId: command.adminId, accountId: value.accountId, action: "SUPPORT_TICKET_ADMIN_UPDATED", targetType: "SupportTicket", targetId: value.id, metadata: redactSupportObject({ state: command.state, priority: command.priority, assigned: command.assignedToId !== undefined, publicReply: Boolean(command.body), internalNote: Boolean(command.internalNote) }) })];
        if (command.body) effects.push(Object.freeze({ kind: "NOTIFICATION", messageType: "SUPPORT_TICKET_REPLY", recipient: command.customerEmail!.trim(), subject: `Support reply for ${value.publicId}`, deduplicationKey: `support-reply:${value.id}:${at.getTime()}`, payload: redactSupportObject({ ticketPublicId: value.publicId }) }));
        return { status: "OK", value, effects: Object.freeze(effects) };
      } catch { return persistenceFailure(); }
    },
  });
}

export function createSupportQueryCapability(repository: SupportRepository): SupportQueryCapability {
  return Object.freeze({
    async listCustomerTickets(input: SupportCustomerListInput): Promise<SupportQueryResult> {
      if (!id(input.userId) || !Array.isArray(input.accessibleAccountIds)) return { status: "FAILED", code: "INVALID_INPUT" };
      const take = limit(input.limit, 100, 100);
      if (take === null) return { status: "FAILED", code: "INVALID_INPUT" };
      try { return { status: "OK", values: await repository.listCustomerTickets({ userId: input.userId, accessibleAccountIds: ids(input.accessibleAccountIds), limit: take }) }; }
      catch { return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" }; }
    },
    async listAdminTickets(requestedLimit?: number): Promise<SupportQueryResult> {
      const take = limit(requestedLimit, 200, 200);
      if (take === null) return { status: "FAILED", code: "INVALID_INPUT" };
      try { return { status: "OK", values: await repository.listAdminTickets(take) }; }
      catch { return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" }; }
    },
  });
}
