import type {
  NotificationsInboxPolicyCapability,
  NotificationsPrincipalContext,
  NotificationsReceiptState,
} from "../contracts/notification-inbox.contract";
import type {
  NotificationsAudience,
  NotificationsIntentSnapshot,
} from "../contracts/notification-intent.contract";

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function audienceMatches(
  audience: NotificationsAudience,
  principal: NotificationsPrincipalContext,
): boolean {
  switch (audience.kind) {
    case "PRINCIPAL":
      return audience.principalId === principal.principalId;
    case "ACCOUNT":
      return principal.accountIds.includes(audience.accountId);
    case "ADMINISTRATORS":
      return principal.role === "ADMIN";
    case "SEGMENT":
      return principal.segmentKeys?.includes(audience.segmentKey) ?? false;
    case "ALL_USERS":
      return true;
    case "ALL_ACTIVE_CLIENTS":
      return principal.activeClient === true;
    case "VISITOR":
      if (audience.visitorId == null) return principal.visitorId != null;
      return audience.visitorId === principal.visitorId;
  }
}

function validPrincipal(principal: NotificationsPrincipalContext): boolean {
  return (
    hasText(principal.principalId) &&
    hasText(principal.role) &&
    principal.accountIds.every(hasText) &&
    (principal.segmentKeys?.every(hasText) ?? true)
  );
}

function copyIntent(
  intent: NotificationsIntentSnapshot,
  notificationId: string,
  createdAt: Date,
) {
  return Object.freeze({
    ...intent,
    source: Object.freeze({ ...intent.source }),
    audience: Object.freeze({ ...intent.audience }),
    content: Object.freeze({
      ...intent.content,
      data: intent.content.data,
    }),
    context: Object.freeze({
      ...intent.context,
      attributes: Object.freeze({ ...intent.context.attributes }),
    }),
    notificationId,
    createdAt: new Date(createdAt.getTime()),
    expiresAt: intent.expiresAt ? new Date(intent.expiresAt.getTime()) : null,
  });
}

export function createNotificationsInboxPolicyCapability(
  now: () => Date = () => new Date(),
): NotificationsInboxPolicyCapability {
  const capability: NotificationsInboxPolicyCapability = {
    materialize(input) {
      if (
        !hasText(input.notificationId) ||
        Number.isNaN(input.createdAt.getTime()) ||
        input.createdAt.getTime() > now().getTime() + 5 * 60_000
      ) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }
      return {
        status: "MATERIALIZED",
        value: copyIntent(
          input.intent,
          input.notificationId.trim(),
          input.createdAt,
        ),
      };
    },

    visibility(input) {
      if (!validPrincipal(input.principal)) {
        return { status: "HIDDEN", code: "AUDIENCE_MISMATCH" };
      }
      if (input.receiptState === "DISMISSED") {
        return { status: "HIDDEN", code: "DISMISSED" };
      }

      const current = input.now ?? now();
      if (
        input.notification.expiresAt &&
        input.notification.expiresAt.getTime() <= current.getTime()
      ) {
        return { status: "HIDDEN", code: "EXPIRED" };
      }

      if (!audienceMatches(input.notification.audience, input.principal)) {
        return { status: "HIDDEN", code: "AUDIENCE_MISMATCH" };
      }

      return { status: "VISIBLE" };
    },

    transitionReceipt(input) {
      const state = input.state as NotificationsReceiptState;
      if (!["UNREAD", "READ", "DISMISSED"].includes(state)) {
        return { status: "FAILED", code: "INVALID_STATE" };
      }

      if (input.action === "MARK_READ") {
        if (state === "UNREAD") {
          return { status: "TRANSITIONED", state: "READ" };
        }
        return { status: "UNCHANGED", state };
      }

      if (input.action === "DISMISS") {
        if (state === "DISMISSED") {
          return { status: "UNCHANGED", state };
        }
        return { status: "TRANSITIONED", state: "DISMISSED" };
      }

      return { status: "FAILED", code: "INVALID_ACTION" };
    },
  };

  return Object.freeze(capability);
}
