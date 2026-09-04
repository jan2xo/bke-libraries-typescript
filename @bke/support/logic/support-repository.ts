import type {
  SupportSafeObject,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketSnapshot,
  SupportTicketState,
} from "../contracts/support.contract";

export interface SupportCreatePersistenceInput {
  readonly ticketId: string;
  readonly publicId: string;
  readonly messageId: string;
  readonly eventId: string;
  readonly userId: string;
  readonly accountId: string;
  readonly orderId: string | null;
  readonly licenseId: string | null;
  readonly category: SupportTicketCategory;
  readonly priority: SupportTicketPriority;
  readonly subject: string;
  readonly body: string;
  readonly safeContext: SupportSafeObject;
  readonly securityReport: boolean;
  readonly eventType: "SECURITY_REPORT_CREATED" | "TICKET_CREATED";
  readonly eventMetadata: SupportSafeObject;
  readonly now: Date;
}

export interface SupportCustomerReplyPersistenceInput {
  readonly messageId: string;
  readonly eventId: string;
  readonly userId: string;
  readonly ticketId: string;
  readonly accessibleAccountIds: readonly string[];
  readonly body: string;
  readonly now: Date;
}

export type SupportCustomerReplyPersistenceResult =
  | { readonly status: "OK"; readonly value: SupportTicketSnapshot }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "INVALID_STATE" };

export interface SupportAdminUpdatePersistenceInput {
  readonly publicMessageId: string | null;
  readonly internalMessageId: string | null;
  readonly eventId: string;
  readonly adminId: string;
  readonly ticketId: string;
  readonly body?: string;
  readonly internalNote?: string;
  readonly state?: SupportTicketState;
  readonly priority?: SupportTicketPriority;
  readonly assignedToId?: string | null;
  readonly eventMetadata: SupportSafeObject;
  readonly now: Date;
}

export interface SupportRepository {
  createTicket(input: SupportCreatePersistenceInput): Promise<SupportTicketSnapshot>;
  customerReply(input: SupportCustomerReplyPersistenceInput): Promise<SupportCustomerReplyPersistenceResult>;
  adminUpdate(input: SupportAdminUpdatePersistenceInput): Promise<SupportTicketSnapshot | null>;
  listCustomerTickets(input: { readonly userId: string; readonly accessibleAccountIds: readonly string[]; readonly limit: number }): Promise<readonly SupportTicketSnapshot[]>;
  listAdminTickets(limit: number): Promise<readonly SupportTicketSnapshot[]>;
}
