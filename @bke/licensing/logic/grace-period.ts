import {
  LICENSING_GRACE_PRODUCTS,
  type LicensingGracePeriodCapability,
  type LicensingGraceProduct,
  type LicensingGraceStatuses,
} from "../contracts/grace-period.contract";
import type { LicensingGraceMutationEffect, LicensingGracePeriodStore } from "./grace-period-ports";

export function isLicensingGraceProduct(value: string): value is LicensingGraceProduct {
  return (LICENSING_GRACE_PRODUCTS as readonly string[]).includes(value);
}

export function parseLicensingGraceProduct(value: string): LicensingGraceProduct {
  if (!isLicensingGraceProduct(value)) throw new Error(`Unknown grace product: ${value}`);
  return value;
}

export function parseLicensingGraceBoolean(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Grace value must be exactly true or false.");
}

export function createLicensingGracePeriodCapability(input: Readonly<{
  store: LicensingGracePeriodStore;
  mutationEffect: LicensingGraceMutationEffect;
}>): LicensingGracePeriodCapability {
  return Object.freeze({
    async readState(productKey: LicensingGraceProduct) {
      try {
        const row = await input.store.findState(productKey);
        return row?.graceEnabled === true;
      } catch {
        return false;
      }
    },

    async readStatuses(): Promise<LicensingGraceStatuses> {
      const rows = await input.store.findStates(LICENSING_GRACE_PRODUCTS);
      const result: Record<LicensingGraceProduct, boolean> = { airstack: false, renderdock: false };
      for (const row of rows) {
        if (isLicensingGraceProduct(row.productKey)) result[row.productKey] = row.graceEnabled;
      }
      return Object.freeze(result);
    },

    async setState({ productKey, graceEnabled, operationSource }: Readonly<{
      productKey: LicensingGraceProduct;
      graceEnabled: boolean;
      operationSource: string;
    }>) {
      return input.store.withTransaction(async (transaction) => {
        const existing = await transaction.findState(productKey);
        const oldValue = existing?.graceEnabled ?? false;
        await transaction.upsertState(productKey, graceEnabled);
        await input.mutationEffect.record(
          Object.freeze({ productKey, oldValue, newValue: graceEnabled, operationSource }),
          transaction.effectTransaction,
        );
        return oldValue;
      });
    },
  });
}
