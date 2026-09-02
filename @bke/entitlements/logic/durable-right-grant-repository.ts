import type {
  EntitlementsGrantDurableRightInput,
  EntitlementsDurableRightSnapshot,
} from "../contracts/durable-right-grant.contract";

export type EntitlementsDurableRightGrantRepositoryResult =
  | { readonly status: "GRANTED"; readonly value: EntitlementsDurableRightSnapshot }
  | { readonly status: "EXISTING"; readonly value: EntitlementsDurableRightSnapshot }
  | { readonly status: "REJECTED"; readonly code: "SOURCE_CONFLICT" };

export interface EntitlementsDurableRightGrantRepository {
  grant(
    input: EntitlementsGrantDurableRightInput,
  ): Promise<EntitlementsDurableRightGrantRepositoryResult>;
}
