export const SUPPORT_COMMAND_CAPABILITY_ID = "bke.support.command.v1" as const;
export const SUPPORT_QUERY_CAPABILITY_ID = "bke.support.query.v1" as const;
export const SUPPORT_CONTEXT_PORT_ID = "bke.support.context.v1" as const;

export const SUPPORT_TICKET_CATEGORIES = [
  "ACCOUNT",
  "PAYMENT",
  "REFUND",
  "INVOICE",
  "LICENSE",
  "DEVICE",
  "DOWNLOAD",
  "SECURITY",
  "FEATURE_REQUEST",
  "OTHER",
] as const;
export const SUPPORT_TICKET_STATES = [
  "OPEN",
  "TRIAGED",
  "WAITING_ON_CUSTOMER",
  "WAITING_ON_SUPPORT",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
] as const;
export const SUPPORT_TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const SUPPORT_MESSAGE_VISIBILITIES = ["PUBLIC", "INTERNAL"] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];
export type SupportTicketState = (typeof SUPPORT_TICKET_STATES)[number];
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];
export type SupportMessageVisibility = (typeof SUPPORT_MESSAGE_VISIBILITIES)[number];
export type SupportSafeObject = Readonly<Record<string, unknown>>;

export interface SupportMessageSnapshot {
  readonly id: string;
  readonly ticketId: string;
  readonly authorId: string;
  readonly body: string;
  readonly visibility: SupportMessageVisibility;
  readonly createdAt: Date;
}

export interface SupportEventSnapshot {
  readonly id: string;
  readonly ticketId: string;
  readonly actorId: string | null;
  readonly eventType: string;
  readonly metadata: SupportSafeObject;
  readonly createdAt: Date;
}

export interface SupportTicketSnapshot {
  readonly id: string;
  readonly publicId: string;
  readonly createdById: string;
  readonly accountId: string;
  readonly orderId: string | null;
  readonly licenseId: string | null;
  readonly category: SupportTicketCategory;
  readonly state: SupportTicketState;
  readonly priority: SupportTicketPriority;
  readonly subject: string;
  readonly safeContext: SupportSafeObject;
  readonly securityReport: boolean;
  readonly assignedToId?: string | null;
  readonly lastCustomerReplyAt: Date | null;
  readonly lastAdminReplyAt: Date | null;
  readonly escalatedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly messages: readonly SupportMessageSnapshot[];
  readonly events?: readonly SupportEventSnapshot[];
}

export interface SupportContextRequest {
  readonly userId: string;
  readonly accountId: string;
  readonly orderId?: string | null;
  readonly licenseId?: string | null;
}

export type SupportContextResolution =
  | { readonly status: "AUTHORIZED"; readonly safeContext: SupportSafeObject }
  | { readonly status: "REJECTED"; readonly code: "FORBIDDEN" | "ACCOUNT_NOT_ACTIVE" | "ORDER_NOT_FOUND" | "LICENSE_NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: "CONTEXT_UNAVAILABLE" };

export interface SupportContextPort {
  resolve(input: SupportContextRequest): Promise<SupportContextResolution>;
}

export type SupportEffect =
  | {
      readonly kind: "AUDIT";
      readonly actorId: string;
      readonly accountId: string;
      readonly action: "SUPPORT_SECURITY_REPORT_CREATED" | "SUPPORT_TICKET_CREATED" | "SUPPORT_TICKET_ADMIN_UPDATED";
      readonly targetType: "SupportTicket";
      readonly targetId: string;
      readonly metadata: SupportSafeObject;
    }
  | {
      readonly kind: "NOTIFICATION";
      readonly messageType: "SUPPORT_TICKET_OPENED" | "SUPPORT_TICKET_REPLY";
      readonly recipient: string;
      readonly subject: string;
      readonly deduplicationKey: string;
      readonly payload: SupportSafeObject;
    };

export interface SupportCreateTicketInput {
  readonly userId: string;
  readonly accountId: string;
  readonly category: SupportTicketCategory;
  readonly priority?: SupportTicketPriority;
  readonly subject: string;
  readonly body: string;
  readonly orderId?: string | null;
  readonly licenseId?: string | null;
  readonly supportNotificationRecipient: string;
}

export interface SupportCustomerReplyInput {
  readonly userId: string;
  readonly ticketId: string;
  readonly accessibleAccountIds: readonly string[];
  readonly body: string;
}

export interface SupportAdminUpdateInput {
  readonly adminId: string;
  readonly ticketId: string;
  readonly body?: string;
  readonly internalNote?: string;
  readonly state?: SupportTicketState;
  readonly priority?: SupportTicketPriority;
  readonly assignedToId?: string | null;
  readonly customerEmail?: string;
}

export type SupportCommandResult<T> =
  | { readonly status: "OK"; readonly value: T; readonly effects: readonly SupportEffect[] }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "REJECTED"; readonly code: "FORBIDDEN" | "ACCOUNT_NOT_ACTIVE" | "ORDER_NOT_FOUND" | "LICENSE_NOT_FOUND" | "INVALID_STATE" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "CONTEXT_UNAVAILABLE" | "PERSISTENCE_UNAVAILABLE" };

export interface SupportCommandCapability {
  createTicket(input: SupportCreateTicketInput): Promise<SupportCommandResult<SupportTicketSnapshot>>;
  customerReply(input: SupportCustomerReplyInput): Promise<SupportCommandResult<SupportTicketSnapshot>>;
  adminUpdate(input: SupportAdminUpdateInput): Promise<SupportCommandResult<SupportTicketSnapshot>>;
}

export type SupportQueryResult =
  | { readonly status: "OK"; readonly values: readonly SupportTicketSnapshot[] }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface SupportCustomerListInput {
  readonly userId: string;
  readonly accessibleAccountIds: readonly string[];
  readonly limit?: number;
}

export interface SupportQueryCapability {
  listCustomerTickets(input: SupportCustomerListInput): Promise<SupportQueryResult>;
  listAdminTickets(limit?: number): Promise<SupportQueryResult>;
}
