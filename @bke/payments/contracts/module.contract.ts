export interface PaymentsModuleManifest {
  readonly moduleId: "payments";
  readonly needs: readonly string[];
  readonly provides: readonly string[];
}
