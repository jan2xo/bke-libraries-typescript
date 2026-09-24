import type { CommerceOrderSourceSnapshot } from "../contracts/order-source-lookup.contract";

export interface CommerceOrderSourceLookupRepository {
  findBySourceReference(
    sourceReference: string,
  ): Promise<CommerceOrderSourceSnapshot | null>;
}
