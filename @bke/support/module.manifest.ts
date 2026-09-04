import { SUPPORT_COMMAND_CAPABILITY_ID, SUPPORT_CONTEXT_PORT_ID, SUPPORT_QUERY_CAPABILITY_ID } from "./contracts/support.contract";
import type { SupportModuleManifest } from "./contracts/module.contract";

export const supportModuleManifest = Object.freeze({
  moduleId: "support",
  needs: [SUPPORT_CONTEXT_PORT_ID],
  provides: [SUPPORT_COMMAND_CAPABILITY_ID, SUPPORT_QUERY_CAPABILITY_ID],
} satisfies SupportModuleManifest);
