export const NOTIFICATIONS_INTENT_CAPABILITY_ID = "bke.notifications.intent.v1" as const;

export type NotificationsAudience =
  | { readonly kind: "PRINCIPAL"; readonly principalId: string }
  | { readonly kind: "ACCOUNT"; readonly accountId: string }
  | { readonly kind: "SEGMENT"; readonly segmentKey: string }
  | { readonly kind: "ALL_USERS" }
  | { readonly kind: "ALL_ACTIVE_CLIENTS" }
  | { readonly kind: "VISITOR"; readonly visitorId?: string | null };

export type NotificationsCategory =
  | "PROMOTION"
  | "SYSTEM"
  | "TRANSACTIONAL"
  | "SECURITY"
  | "LICENSE"
  | "UPDATE"
  | "CUSTOM";

export type NotificationsTrigger =
  | "LOGIN"
  | "SITE_ENTRY"
  | "FIRST_VISIT"
  | "PAYMENT_SETTLED"
  | "LICENSE_EVENT"
  | "ADMIN_BROADCAST"
  | "CUSTOM";

export type NotificationsPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface NotificationsCreateIntentInput {
  readonly source: {
    readonly moduleId: string;
    readonly event: string;
    readonly sourceReference?: string | null;
  };
  readonly audience: NotificationsAudience;
  readonly content: {
    readonly title: string;
    readonly body: string;
    readonly category: NotificationsCategory;
    readonly data?: unknown;
  };
  readonly context?: {
    readonly trigger?: NotificationsTrigger | null;
    readonly placementHint?: string | null;
    readonly attributes?: Readonly<Record<string, unknown>>;
  };
  readonly priority?: NotificationsPriority;
  readonly idempotencyKey: string;
  readonly eligible?: boolean;
  readonly expiresAt?: Date | null;
}

export interface NotificationsIntentSnapshot {
  readonly source: {
    readonly moduleId: string;
    readonly event: string;
    readonly sourceReference: string | null;
  };
  readonly audience: NotificationsAudience;
  readonly content: {
    readonly title: string;
    readonly body: string;
    readonly category: NotificationsCategory;
    readonly data: unknown;
  };
  readonly context: {
    readonly trigger: NotificationsTrigger | null;
    readonly placementHint: string | null;
    readonly attributes: Readonly<Record<string, unknown>>;
  };
  readonly priority: NotificationsPriority;
  readonly idempotencyKey: string;
  readonly expiresAt: Date | null;
}

export type NotificationsCreateIntentResult =
  | { readonly status: "NOTIFY"; readonly value: NotificationsIntentSnapshot }
  | { readonly status: "DO_NOT_NOTIFY"; readonly code: "INELIGIBLE" | "EXPIRED" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" };

export interface NotificationsIntentCapability {
  create(input: NotificationsCreateIntentInput): NotificationsCreateIntentResult;
}
