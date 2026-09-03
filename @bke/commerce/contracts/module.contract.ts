export interface CommerceModuleManifest {
  readonly moduleId: "commerce";
  readonly needs: readonly string[];
  readonly provides: readonly string[];
}
