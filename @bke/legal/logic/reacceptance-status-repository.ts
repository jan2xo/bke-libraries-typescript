import type {
  LegalPendingReacceptanceSnapshot,
  LegalReacceptanceStatusInput,
} from "../contracts/reacceptance-status.contract";

export interface LegalReacceptanceStatusRepository {
  findPending(
    input: LegalReacceptanceStatusInput,
  ): Promise<readonly LegalPendingReacceptanceSnapshot[]>;
}
