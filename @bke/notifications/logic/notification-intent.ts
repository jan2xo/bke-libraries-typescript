import type {
  NotificationsAudience,
  NotificationsCreateIntentInput,
  NotificationsCreateIntentResult,
  NotificationsIntentCapability,
} from "../contracts/notification-intent.contract";

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function validAudience(audience: NotificationsAudience): boolean {
  switch (audience.kind) {
    case "PRINCIPAL":
      return hasText(audience.principalId);
    case "ACCOUNT":
      return hasText(audience.accountId);
    case "SEGMENT":
      return hasText(audience.segmentKey);
    case "VISITOR":
      return audience.visitorId == null || hasText(audience.visitorId);
    case "ALL_USERS":
    case "ALL_ACTIVE_CLIENTS":
      return true;
  }
}

function invalid(input: NotificationsCreateIntentInput): boolean {
  return (
    !hasText(input.source.moduleId) ||
    !hasText(input.source.event) ||
    !hasText(input.content.title) ||
    !hasText(input.content.body) ||
    !hasText(input.idempotencyKey) ||
    !validAudience(input.audience)
  );
}

export function createNotificationsIntentCapability(
  now: () => Date = () => new Date(),
): NotificationsIntentCapability {
  return Object.freeze({
    create(input: NotificationsCreateIntentInput): NotificationsCreateIntentResult {
      if (invalid(input)) return { status: "FAILED", code: "INVALID_INPUT" };
      if (input.eligible === false) return { status: "DO_NOT_NOTIFY", code: "INELIGIBLE" };
      if (input.expiresAt && input.expiresAt.getTime() <= now().getTime()) {
        return { status: "DO_NOT_NOTIFY", code: "EXPIRED" };
      }

      return {
        status: "NOTIFY",
        value: Object.freeze({
          source: Object.freeze({
            moduleId: input.source.moduleId.trim(),
            event: input.source.event.trim(),
            sourceReference: input.source.sourceReference?.trim() || null,
          }),
          audience: Object.freeze({ ...input.audience }),
          content: Object.freeze({
            title: input.content.title.trim(),
            body: input.content.body.trim(),
            category: input.content.category,
            data: input.content.data ?? null,
          }),
          context: Object.freeze({
            trigger: input.context?.trigger ?? null,
            placementHint: input.context?.placementHint?.trim() || null,
            attributes: Object.freeze({ ...(input.context?.attributes ?? {}) }),
          }),
          priority: input.priority ?? "NORMAL",
          idempotencyKey: input.idempotencyKey.trim(),
          expiresAt: input.expiresAt ?? null,
        }),
      };
    },
  });
}
