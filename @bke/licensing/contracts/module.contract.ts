export interface LicensingModuleManifest {
  readonly moduleId: "bke.licensing";
  readonly needs: readonly string[];
  readonly provides: readonly string[];
}
