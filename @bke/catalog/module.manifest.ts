import {
  CATALOG_LOOKUP_CAPABILITY_ID,
  CATALOG_MANAGEMENT_CAPABILITY_ID,
} from "./contracts/catalog.contract";
import type { CatalogModuleManifest } from "./contracts/module.contract";

export const catalogModuleManifest = Object.freeze({
  moduleId: "catalog",
  needs: [],
  provides: [CATALOG_LOOKUP_CAPABILITY_ID, CATALOG_MANAGEMENT_CAPABILITY_ID],
} satisfies CatalogModuleManifest);
