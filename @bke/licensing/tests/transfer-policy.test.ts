import { describe, expect, it } from "vitest";
import { isTransferAllowed } from "../contracts/transfer-policy.contract";

describe("commercial transfer policy", () => {
  it("fails closed when the requested policy id is missing", () => {
    expect(isTransferAllowed({
      requestedPolicyId: "",
      orderItemPolicyId: "policy-a",
      policy: { policyId: "policy-a", transferable: true },
    })).toBe(false);
  });

  it("requires exact Commerce order-item policy equality", () => {
    expect(isTransferAllowed({
      requestedPolicyId: "policy-a",
      orderItemPolicyId: "policy-b",
      policy: { policyId: "policy-b", transferable: true },
    })).toBe(false);
    expect(isTransferAllowed({
      requestedPolicyId: "policy-a",
      orderItemPolicyId: null,
      policy: null,
    })).toBe(false);
  });

  it("requires the exact Licensing policy fact and transferable true", () => {
    expect(isTransferAllowed({
      requestedPolicyId: "policy-a",
      orderItemPolicyId: "policy-a",
      policy: null,
    })).toBe(false);
    expect(isTransferAllowed({
      requestedPolicyId: "policy-a",
      orderItemPolicyId: "policy-a",
      policy: { policyId: "policy-a", transferable: false },
    })).toBe(false);
    expect(isTransferAllowed({
      requestedPolicyId: "policy-a",
      orderItemPolicyId: "policy-a",
      policy: { policyId: "policy-a", transferable: true },
    })).toBe(true);
  });

  it("does not trim or normalize policy identifiers", () => {
    expect(isTransferAllowed({
      requestedPolicyId: " policy-a ",
      orderItemPolicyId: "policy-a",
      policy: { policyId: "policy-a", transferable: true },
    })).toBe(false);
    expect(isTransferAllowed({
      requestedPolicyId: " policy-a ",
      orderItemPolicyId: " policy-a ",
      policy: { policyId: " policy-a ", transferable: true },
    })).toBe(true);
  });
});
