import type {
  EntitlementsDurableRightRevocationSnapshot,
  EntitlementsRevokeDurableRightInput,
} from "../contracts/durable-right-revocation.contract";

export type EntitlementsDurableRightRevocationRepositoryResult =
  | { readonly status: "REVOKED"; readonly value: EntitlementsDurableRightRevocationSnapshot }
  | { readonly status: "EXISTING"; readonly value: EntitlementsDurableRightRevocationSnapshot }
  | { readonly status: "REJECTED"; readonly code: "NOT_FOUND" | "REVOCATION_CONFLICT" };

export interface EntitlementsDurableRightRevocationRepository {
  revoke(
    input: EntitlementsRevokeDurableRightInput,
  ): Promise<EntitlementsDurableRightRevocationRepositoryResult>;
}
