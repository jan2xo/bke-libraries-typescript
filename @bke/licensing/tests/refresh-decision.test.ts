import { describe, expect, it } from "vitest";
import { refreshRequiresReplacement } from "../logic/refresh-decision";

const current = Object.freeze({
  version: "1.2.3",
  expiresAt: new Date("2026-10-01T00:00:00.000Z"),
  installationId: "installation-1",
  deviceId: "device-identity-0001",
  signerKeyId: "key-1",
  status: "ACTIVE",
  serverRevision: 1,
});

const expected = Object.freeze({
  version: "1.2.3",
  expiresAt: new Date("2026-10-01T00:00:00.000Z"),
  installationId: "installation-1",
  deviceId: "device-identity-0001",
  signerKeyId: "key-1",
});

describe("commercial refresh replacement", () => {
  it("reuses an exactly current lease", () => {
    expect(refreshRequiresReplacement(current, expected)).toBe(false);
  });

  it.each([
    [{ ...current, status: "SUPERSEDED" }, expected],
    [{ ...current, version: "1.2.2" }, expected],
    [{ ...current, expiresAt: new Date("2026-09-30T00:00:00.000Z") }, expected],
    [{ ...current, installationId: "installation-2" }, expected],
    [{ ...current, deviceId: "device-identity-0002" }, expected],
    [{ ...current, signerKeyId: "key-2" }, expected],
    [{ ...current, serverRevision: 0 }, expected],
  ])("requires replacement when a certified lease field drifts", (actual, target) => {
    expect(refreshRequiresReplacement(actual, target)).toBe(true);
  });
});
