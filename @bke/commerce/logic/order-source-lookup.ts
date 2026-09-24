import type {
  CommerceFindOrderBySourceInput,
  CommerceFindOrderBySourceResult,
  CommerceOrderSourceLookupCapability,
} from "../contracts/order-source-lookup.contract";
import type { CommerceOrderSourceLookupRepository } from "./order-source-lookup-repository";

export function createCommerceOrderSourceLookupCapability(
  repository: CommerceOrderSourceLookupRepository,
): CommerceOrderSourceLookupCapability {
  return Object.freeze({
    async find(input: CommerceFindOrderBySourceInput): Promise<CommerceFindOrderBySourceResult> {
      const sourceReference = input.sourceReference.trim();
      if (!sourceReference || sourceReference.length > 200) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        const value = await repository.findBySourceReference(sourceReference);
        return value
          ? { status: "FOUND", value }
          : { status: "NOT_FOUND" };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
