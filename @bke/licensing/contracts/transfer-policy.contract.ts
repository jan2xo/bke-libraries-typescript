export const LICENSING_TRANSFER_POLICY_CAPABILITY_ID = "bke.licensing.transfer-policy.v1" as const;

export interface LicensingTransferPolicySnapshot {
  readonly policyId: string;
  readonly transferable: boolean;
}

export type LicensingTransferPolicyLookupResult =
  | { readonly status: "FOUND"; readonly value: LicensingTransferPolicySnapshot }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface LicensingTransferPolicyCapability {
  findByPolicyId(policyId: string): Promise<LicensingTransferPolicyLookupResult>;
}

export function transferPolicyIdFromOperationMetadata(metadata: unknown): string {
  if (typeof metadata !== "object" || metadata === null || !("policyId" in metadata)) return "";
  return String((metadata as { policyId?: unknown }).policyId);
}

export function isTransferAllowed(input: {
  readonly requestedPolicyId: string;
  readonly orderItemPolicyId: string | null | undefined;
  readonly policy: LicensingTransferPolicySnapshot | null | undefined;
}): boolean {
  return input.requestedPolicyId.length > 0
    && input.orderItemPolicyId === input.requestedPolicyId
    && input.policy?.policyId === input.orderItemPolicyId
    && input.policy.transferable === true;
}
