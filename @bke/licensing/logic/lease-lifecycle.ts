export { commercialLeaseActions } from "../contracts/commercial-lease.contract";
export type { CommercialLeaseAction } from "../contracts/commercial-lease.contract";

export type LeaseLifecycle = Readonly<{
  generation: number;
  serverRevision: number;
}>;

export function nextLeaseLifecycle(previous?: LeaseLifecycle | null): LeaseLifecycle {
  return Object.freeze({
    generation: (previous?.generation ?? 0) + 1,
    serverRevision: (previous?.serverRevision ?? 0) + 1,
  });
}

export function requireProductVersion(version?: string | null): string {
  if (
    !version ||
    version === "0.0.0" ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)
  ) {
    throw new Error("INVALID_LICENSE_VERSION");
  }
  return version;
}
