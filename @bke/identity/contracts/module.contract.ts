export type IdentityCapabilityId = string;

export interface IdentityModuleManifest {
  readonly moduleId: string;
  readonly needs: readonly IdentityCapabilityId[];
  readonly provides: readonly IdentityCapabilityId[];
}

export interface IdentityCapabilityRegistration<T = unknown> {
  readonly id: IdentityCapabilityId;
  readonly value: T;
}

export interface IdentityCapabilityModule {
  readonly manifest: IdentityModuleManifest;
  start(): readonly IdentityCapabilityRegistration[];
}
