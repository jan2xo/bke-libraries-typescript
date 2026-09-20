import type {
  NotificationsAudience,
  NotificationsIntentSnapshot,
} from "./notification-intent.contract";

export const NOTIFICATIONS_INBOX_POLICY_CAPABILITY_ID =
  "bke.notifications.inbox-policy.v1" as const;

export type NotificationsReceiptState = "UNREAD" | "READ" | "DISMISSED";
export type NotificationsReceiptAction = "MARK_READ" | "DISMISS";

export interface NotificationsPrincipalContext {
  readonly principalId: string;
  readonly role: string;
  readonly accountIds: readonly string[];
  readonly segmentKeys?: readonly string[];
  readonly activeClient?: boolean;
  readonly visitorId?: string | null;
}

export interface NotificationsDurableSnapshot extends NotificationsIntentSnapshot {
  readonly notificationId: string;
  readonly createdAt: Date;
}

export type NotificationsMaterializeResult =
  | { readonly status: "MATERIALIZED"; readonly value: NotificationsDurableSnapshot }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" };

export type NotificationsVisibilityResult =
  | { readonly status: "VISIBLE" }
  | {
      readonly status: "HIDDEN";
      readonly code:
        | "AUDIENCE_MISMATCH"
        | "EXPIRED"
        | "DISMISSED";
    };

export type NotificationsReceiptTransitionResult =
  | { readonly status: "TRANSITIONED"; readonly state: NotificationsReceiptState }
  | { readonly status: "UNCHANGED"; readonly state: NotificationsReceiptState }
  | { readonly status: "FAILED"; readonly code: "INVALID_STATE" | "INVALID_ACTION" };

export interface NotificationsInboxPolicyCapability {
  materialize(input: Readonly<{
    notificationId: string;
    intent: NotificationsIntentSnapshot;
    createdAt: Date;
  }>): NotificationsMaterializeResult;

  visibility(input: Readonly<{
    notification: NotificationsDurableSnapshot;
    principal: NotificationsPrincipalContext;
    receiptState?: NotificationsReceiptState | null;
    now?: Date;
  }>): NotificationsVisibilityResult;

  transitionReceipt(input: Readonly<{
    state: NotificationsReceiptState;
    action: NotificationsReceiptAction;
  }>): NotificationsReceiptTransitionResult;
}

export function isNotificationsAudience(
  audience: NotificationsAudience,
): audience is NotificationsAudience {
  return Boolean(audience);
}
