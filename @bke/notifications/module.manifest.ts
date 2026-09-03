import type { NotificationsModuleManifest } from "./contracts/module-manifest.contract";
import { NOTIFICATIONS_INTENT_CAPABILITY_ID } from "./contracts/notification-intent.contract";

export const notificationsModuleManifest = Object.freeze({
  moduleId: "notifications",
  needs: [],
  provides: [NOTIFICATIONS_INTENT_CAPABILITY_ID],
} satisfies NotificationsModuleManifest);
