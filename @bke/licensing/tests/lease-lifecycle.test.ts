import { describe, expect, it } from "vitest";
import { nextLeaseLifecycle, requireProductVersion } from "../logic/lease-lifecycle";

describe("commercial lease lifecycle", () => {
  it("starts generation and server revision at one", () => {
    expect(nextLeaseLifecycle()).toEqual({ generation: 1, serverRevision: 1 });
  });

  it("increments both lifecycle counters from the predecessor", () => {
    expect(nextLeaseLifecycle({ generation: 7, serverRevision: 11 })).toEqual({
      generation: 8,
      serverRevision: 12,
    });
  });

  it.each(["1.0.0", "2.4.1-beta.2", "3.0.0+build.9"])(
    "accepts supported semantic version %s",
    (version) => {
      expect(requireProductVersion(version)).toBe(version);
    },
  );

  it.each([undefined, null, "", "0.0.0", "1", "1.2", "v1.2.3", "1.2.x"])(
    "rejects invalid license version %s",
    (version) => {
      expect(() => requireProductVersion(version)).toThrow("INVALID_LICENSE_VERSION");
    },
  );
});
