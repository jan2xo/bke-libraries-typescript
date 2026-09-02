import { describe, expect, it } from "vitest";
import { createLicensingLicenseKeyRevealCapability } from "../logic/license-key-reveal";
import type { LicensingLicenseKeyRevealRepository } from "../logic/license-key-reveal-repository";

const fixedNow = new Date("2026-09-02T00:00:00.000Z");

function repository(overrides: Partial<LicensingLicenseKeyRevealRepository> = {}): LicensingLicenseKeyRevealRepository {
  return {
    findByIdAndAccount: async () => ({
      id: "license-1",
      accountId: "account-1",
      keyCiphertext: "ciphertext",
      keyRevealedAt: null,
    }),
    recordSuccessfulReveal: async () => ({
      status: "RECORDED",
      keyRevealedAt: fixedNow,
      firstReveal: true,
    }),
    ...overrides,
  };
}

describe("Licensing license key reveal", () => {
  it("reveals through the decrypter and returns the event intent", async () => {
    const capability = createLicensingLicenseKeyRevealCapability({
      repository: repository(),
      decrypter: { decrypt: (value) => `plain:${value}` },
      clock: { now: () => fixedNow },
    });

    await expect(
      capability.reveal({
        licenseId: "license-1",
        accountId: "account-1",
        actorPrincipalId: "principal-1",
      }),
    ).resolves.toEqual({
      status: "REVEALED",
      licenseId: "license-1",
      licenseKey: "plain:ciphertext",
      keyRevealedAt: fixedNow,
      firstReveal: true,
      event: {
        type: "CUSTOMER_REVEALED",
        metadata: { actorId: "principal-1" },
      },
    });
  });

  it("rejects an unknown account-scoped license before decryption", async () => {
    let decrypted = false;
    const capability = createLicensingLicenseKeyRevealCapability({
      repository: repository({ findByIdAndAccount: async () => null }),
      decrypter: {
        decrypt: () => {
          decrypted = true;
          return "nope";
        },
      },
      clock: { now: () => fixedNow },
    });

    await expect(
      capability.reveal({ licenseId: "missing", accountId: "account-1", actorPrincipalId: "principal-1" }),
    ).resolves.toEqual({ status: "REJECTED", code: "NOT_FOUND" });
    expect(decrypted).toBe(false);
  });

  it("rejects a license whose encrypted key is unavailable", async () => {
    let recorded = false;
    const capability = createLicensingLicenseKeyRevealCapability({
      repository: repository({
        findByIdAndAccount: async () => ({
          id: "license-1",
          accountId: "account-1",
          keyCiphertext: null,
          keyRevealedAt: null,
        }),
        recordSuccessfulReveal: async () => {
          recorded = true;
          return { status: "NOT_FOUND" };
        },
      }),
      decrypter: { decrypt: () => "unused" },
      clock: { now: () => fixedNow },
    });

    await expect(
      capability.reveal({ licenseId: "license-1", accountId: "account-1", actorPrincipalId: "principal-1" }),
    ).resolves.toEqual({ status: "REJECTED", code: "LICENSE_KEY_UNAVAILABLE" });
    expect(recorded).toBe(false);
  });

  it("does not record a reveal when decryption fails", async () => {
    let recorded = false;
    const capability = createLicensingLicenseKeyRevealCapability({
      repository: repository({
        recordSuccessfulReveal: async () => {
          recorded = true;
          return { status: "RECORDED", keyRevealedAt: fixedNow, firstReveal: true };
        },
      }),
      decrypter: { decrypt: () => { throw new Error("INVALID_CIPHERTEXT"); } },
      clock: { now: () => fixedNow },
    });

    await expect(
      capability.reveal({ licenseId: "license-1", accountId: "account-1", actorPrincipalId: "principal-1" }),
    ).rejects.toThrow("INVALID_CIPHERTEXT");
    expect(recorded).toBe(false);
  });
});
