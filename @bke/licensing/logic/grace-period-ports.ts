import type { LicensingGraceMutation, LicensingGraceProduct } from "../contracts/grace-period.contract";

export type LicensingGraceRecord = Readonly<{
  productKey: string;
  graceEnabled: boolean;
}>;

export interface LicensingGraceAtomicEffectTransaction {
  execute(statement: string, values?: readonly unknown[]): Promise<void>;
}

export interface LicensingGraceTransaction {
  findState(productKey: LicensingGraceProduct): Promise<LicensingGraceRecord | null>;
  upsertState(productKey: LicensingGraceProduct, graceEnabled: boolean): Promise<void>;
  readonly effectTransaction: LicensingGraceAtomicEffectTransaction;
}

export interface LicensingGracePeriodStore {
  findState(productKey: LicensingGraceProduct): Promise<LicensingGraceRecord | null>;
  findStates(productKeys: readonly LicensingGraceProduct[]): Promise<readonly LicensingGraceRecord[]>;
  withTransaction<T>(work: (transaction: LicensingGraceTransaction) => Promise<T>): Promise<T>;
}

export interface LicensingGraceMutationEffect {
  record(
    mutation: LicensingGraceMutation,
    transaction: LicensingGraceAtomicEffectTransaction,
  ): Promise<void>;
}
