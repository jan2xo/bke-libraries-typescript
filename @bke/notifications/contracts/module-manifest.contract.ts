export interface NotificationsModuleManifest {
  readonly moduleId: string;
  readonly needs: readonly string[];
  readonly provides: readonly string[];
}
