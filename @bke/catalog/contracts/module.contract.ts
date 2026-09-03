export interface CatalogModuleManifest {
  readonly moduleId: "catalog";
  readonly needs: readonly string[];
  readonly provides: readonly string[];
}
