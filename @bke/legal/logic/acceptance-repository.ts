import type {
  LegalCheckAcceptanceInput,
  LegalCheckAcceptanceResult,
  LegalRecordAcceptanceInput,
  LegalRecordAcceptanceResult,
} from "../contracts/acceptance.contract";

export interface LegalAcceptanceRepository {
  record(input: LegalRecordAcceptanceInput): Promise<LegalRecordAcceptanceResult>;
  check(input: LegalCheckAcceptanceInput): Promise<LegalCheckAcceptanceResult>;
}
