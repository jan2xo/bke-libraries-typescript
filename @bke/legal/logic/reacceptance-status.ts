import type {
  LegalReacceptanceStatusCapability,
  LegalReacceptanceStatusInput,
  LegalReacceptanceStatusResult,
} from "../contracts/reacceptance-status.contract";
import type { LegalReacceptanceStatusRepository } from "./reacceptance-status-repository";

function validInput(input: LegalReacceptanceStatusInput): boolean {
  const principalId = input.principalId.trim();
  return (
    principalId.length > 0 &&
    principalId.length <= 256 &&
    input.principalEstablishedAt instanceof Date &&
    Number.isFinite(input.principalEstablishedAt.getTime())
  );
}

export function createLegalReacceptanceStatusCapability(
  repository: LegalReacceptanceStatusRepository,
): LegalReacceptanceStatusCapability {
  return Object.freeze({
    async check(input: LegalReacceptanceStatusInput): Promise<LegalReacceptanceStatusResult> {
      if (!validInput(input)) return { status: "FAILED", code: "INVALID_INPUT" };
      try {
        const pending = await repository.findPending({
          principalId: input.principalId.trim(),
          principalEstablishedAt: input.principalEstablishedAt,
        });
        if (pending.length === 0) return { status: "CURRENT", pending: [] };
        return { status: "REACCEPTANCE_REQUIRED", pending: Object.freeze([...pending]) };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
