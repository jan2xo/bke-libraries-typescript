import { describe, expect, it } from "vitest";
import type {
  CommerceRecordTrialGrantInput,
  CommerceTrialGrantSnapshot,
} from "../contracts/trial-grant-registry.contract";
import {
  createCommerceTrialGrantRegistryCapability,
  type CommerceTrialGrantRegistryRepository,
} from "../logic/trial-grant-registry";

function snapshot(overrides: Partial<CommerceTrialGrantSnapshot> = {}): CommerceTrialGrantSnapshot {
  return {
    id: "trial-1",
    accountId: "account-1",
    productId: "product-1",
    editionId: "edition-1",
    licenseId: "license-1",
    source: "SELF_SERVICE",
    selfServiceYear: 2026,
    trialStartsAt: new Date("2026-09-12T00:00:00Z"),
    trialEndsAt: new Date("2026-09-19T00:00:00Z"),
    graceEndsAt: new Date("2026-09-19T00:00:00Z"),
    revokedAt: null,
    createdById: "user-1",
    createdAt: new Date("2026-09-12T00:00:00Z"),
    ...overrides,
  };
}

function repository(overrides: Partial<CommerceTrialGrantRegistryRepository> = {}): CommerceTrialGrantRegistryRepository {
  return {
    async findSelfServiceGrant() { return null; },
    async create(input: CommerceRecordTrialGrantInput) {
      return snapshot({
        accountId: input.accountId,
        productId: input.productId,
        editionId: input.editionId,
        licenseId: input.licenseId,
        source: input.source,
        selfServiceYear: input.selfServiceYear ?? null,
        trialStartsAt: input.trialStartsAt,
        trialEndsAt: input.trialEndsAt,
        graceEndsAt: input.graceEndsAt,
        createdById: input.createdById ?? null,
      });
    },
    async findById() { return snapshot(); },
    async setGrace(input) { return snapshot({ graceEndsAt: input.graceEndsAt }); },
    async revoke(input) { return snapshot({ revokedAt: input.revokedAt }); },
    ...overrides,
  };
}

const recordInput: CommerceRecordTrialGrantInput = {
  accountId: "account-1",
  productId: "product-1",
  editionId: "edition-1",
  licenseId: "license-1",
  source: "SELF_SERVICE",
  selfServiceYear: 2026,
  trialStartsAt: new Date("2026-09-12T00:00:00Z"),
  trialEndsAt: new Date("2026-09-19T00:00:00Z"),
  graceEndsAt: new Date("2026-09-21T00:00:00Z"),
  createdById: "user-1",
};

describe("Commerce trial grant registry", () => {
  it("reports annual self-service eligibility from persisted grants", async () => {
    const available = createCommerceTrialGrantRegistryCapability(repository());
    await expect(available.checkSelfServiceEligibility({ accountId: "account-1", productId: "product-1", year: 2026 }))
      .resolves.toEqual({ status: "AVAILABLE" });

    const used = createCommerceTrialGrantRegistryCapability(repository({
      async findSelfServiceGrant() { return snapshot(); },
    }));
    await expect(used.checkSelfServiceEligibility({ accountId: "account-1", productId: "product-1", year: 2026 }))
      .resolves.toEqual({ status: "ALREADY_USED" });
  });

  it("requires a self-service year but forbids one for admin grants", async () => {
    const capability = createCommerceTrialGrantRegistryCapability(repository());
    await expect(capability.record({ ...recordInput, selfServiceYear: null }))
      .resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    await expect(capability.record({ ...recordInput, source: "ADMIN", selfServiceYear: 2026 }))
      .resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
  });

  it("maps the self-service uniqueness race to ALREADY_USED", async () => {
    const capability = createCommerceTrialGrantRegistryCapability(repository({
      async create() { throw { code: "23505" }; },
    }));
    await expect(capability.record(recordInput)).resolves.toEqual({ status: "ALREADY_USED" });
  });

  it("persists grace and revoke transitions without owning Licensing state", async () => {
    const capability = createCommerceTrialGrantRegistryCapability(repository());
    const graceEndsAt = new Date("2026-09-24T00:00:00Z");
    const revokedAt = new Date("2026-09-13T00:00:00Z");

    const grace = await capability.setGrace({ trialId: "trial-1", graceEndsAt });
    expect(grace.status).toBe("OK");
    if (grace.status === "OK") expect(grace.value.graceEndsAt).toEqual(graceEndsAt);

    const revoked = await capability.revoke({ trialId: "trial-1", revokedAt });
    expect(revoked.status).toBe("OK");
    if (revoked.status === "OK") expect(revoked.value.revokedAt).toEqual(revokedAt);
  });
});
