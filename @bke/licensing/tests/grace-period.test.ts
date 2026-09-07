import { describe, expect, it } from "vitest";
import type { LicensingGraceMutation, LicensingGraceProduct } from "../contracts/grace-period.contract";
import { createLicensingGracePeriodCapability, parseLicensingGraceBoolean, parseLicensingGraceProduct } from "../logic/grace-period";
import type {
  LicensingGraceMutationEffect,
  LicensingGracePeriodStore,
  LicensingGraceRecord,
  LicensingGraceTransaction,
} from "../logic/grace-period-ports";

function memoryStore(seed: Partial<Record<LicensingGraceProduct, boolean>> = {}): LicensingGracePeriodStore {
  let state = new Map<string, boolean>(Object.entries(seed));
  const row = (productKey: string): LicensingGraceRecord | null =>
    state.has(productKey) ? Object.freeze({ productKey, graceEnabled: state.get(productKey) === true }) : null;

  return Object.freeze({
    async findState(productKey: LicensingGraceProduct) {
      return row(productKey);
    },
    async findStates(productKeys: readonly LicensingGraceProduct[]) {
      return productKeys
        .map((productKey: LicensingGraceProduct) => row(productKey))
        .filter((value: LicensingGraceRecord | null): value is LicensingGraceRecord => value !== null);
    },
    async withTransaction<T>(work: (transaction: LicensingGraceTransaction) => Promise<T>): Promise<T> {
      const working = new Map(state);
      const transaction = Object.freeze<LicensingGraceTransaction>({
        async findState(productKey) {
          return working.has(productKey)
            ? Object.freeze({ productKey, graceEnabled: working.get(productKey) === true })
            : null;
        },
        async upsertState(productKey, graceEnabled) {
          working.set(productKey, graceEnabled);
        },
        effectTransaction: Object.freeze({ async execute() {} }),
      });
      const result = await work(transaction);
      state = working;
      return result;
    },
  });
}

const noopEffect: LicensingGraceMutationEffect = Object.freeze({ async record() {} });

describe("Licensing grace period", () => {
  it("preserves legacy product and boolean parsing", () => {
    expect(parseLicensingGraceProduct("airstack")).toBe("airstack");
    expect(parseLicensingGraceProduct("renderdock")).toBe("renderdock");
    expect(() => parseLicensingGraceProduct("unknown")).toThrow("Unknown grace product: unknown");
    expect(parseLicensingGraceBoolean("true")).toBe(true);
    expect(parseLicensingGraceBoolean("false")).toBe(false);
    expect(() => parseLicensingGraceBoolean("TRUE")).toThrow("Grace value must be exactly true or false.");
  });

  it("defaults missing statuses to false", async () => {
    const capability = createLicensingGracePeriodCapability({ store: memoryStore({ airstack: true }), mutationEffect: noopEffect });
    await expect(capability.readStatuses()).resolves.toEqual({ airstack: true, renderdock: false });
  });

  it("fails closed for a single-state read when persistence fails", async () => {
    const failingStore: LicensingGracePeriodStore = {
      async findState() { throw new Error("db unavailable"); },
      async findStates() { throw new Error("db unavailable"); },
      async withTransaction() { throw new Error("db unavailable"); },
    };
    const capability = createLicensingGracePeriodCapability({ store: failingStore, mutationEffect: noopEffect });
    await expect(capability.readState("airstack")).resolves.toBe(false);
    await expect(capability.readStatuses()).rejects.toThrow("db unavailable");
  });

  it("returns the old value and emits the mutation effect before commit", async () => {
    const mutations: LicensingGraceMutation[] = [];
    const effect: LicensingGraceMutationEffect = Object.freeze({
      async record(mutation: LicensingGraceMutation) { mutations.push(mutation); },
    });
    const capability = createLicensingGracePeriodCapability({ store: memoryStore({ airstack: true }), mutationEffect: effect });
    await expect(capability.setState({ productKey: "airstack", graceEnabled: false, operationSource: "VPS_CLI" })).resolves.toBe(true);
    await expect(capability.readState("airstack")).resolves.toBe(false);
    expect(mutations).toEqual([{ productKey: "airstack", oldValue: true, newValue: false, operationSource: "VPS_CLI" }]);
  });

  it("rolls back the override when the mutation effect fails", async () => {
    const effect: LicensingGraceMutationEffect = Object.freeze({ async record() { throw new Error("audit failed"); } });
    const capability = createLicensingGracePeriodCapability({ store: memoryStore({ renderdock: false }), mutationEffect: effect });
    await expect(capability.setState({ productKey: "renderdock", graceEnabled: true, operationSource: "VPS_CLI" })).rejects.toThrow("audit failed");
    await expect(capability.readState("renderdock")).resolves.toBe(false);
  });
});
