import {
  CATALOG_LICENSING_VERSION_FACTS_CAPABILITY_ID,
  CATALOG_LOOKUP_CAPABILITY_ID,
  CATALOG_MANAGEMENT_CAPABILITY_ID,
} from "./contracts/catalog.contract";
import { CATALOG_PRODUCT_DELETION_POLICY_CAPABILITY_ID } from "./contracts/product-deletion-policy.contract";
import type { CatalogModuleManifest } from "./contracts/module.contract";

export const catalogModuleManifest = Object.freeze({
  moduleId: "catalog",
  needs: [],
  provides: [
    CATALOG_LOOKUP_CAPABILITY_ID,
    CATALOG_MANAGEMENT_CAPABILITY_ID,
    CATALOG_LICENSING_VERSION_FACTS_CAPABILITY_ID,
    CATALOG_PRODUCT_DELETION_POLICY_CAPABILITY_ID,
  ],
} satisfies CatalogModuleManifest);
