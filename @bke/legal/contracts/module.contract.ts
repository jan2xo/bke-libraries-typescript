export interface LegalModuleManifest {
  readonly moduleId: "legal";
  readonly needs: readonly string[];
  readonly provides: readonly string[];
}
