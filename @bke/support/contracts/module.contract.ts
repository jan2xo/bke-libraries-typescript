export interface SupportModuleManifest {
  readonly moduleId: "support";
  readonly needs: readonly string[];
  readonly provides: readonly string[];
}
