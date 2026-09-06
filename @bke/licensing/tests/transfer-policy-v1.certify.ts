import assert from "node:assert/strict";
import {
  isTransferAllowed,
  transferPolicyIdFromOperationMetadata,
  type LicensingTransferPolicySnapshot,
} from "../contracts/transfer-policy.contract";

function v1TransferPolicyIdFromMetadata(metadata: unknown): string {
  return typeof metadata === "object" && metadata && "policyId" in metadata
    ? String((metadata as { policyId?: unknown }).policyId)
    : "";
}

function v1TransferAllowed(input: {
  requestedPolicyId: string;
  orderItemPolicyId: string | null;
  policy: LicensingTransferPolicySnapshot | null;
}): boolean {
  if (!input.requestedPolicyId) return false;
  if (input.orderItemPolicyId !== input.requestedPolicyId) return false;
  if (!input.policy || input.policy.policyId !== input.orderItemPolicyId) return false;
  return input.policy.transferable === true;
}

const metadataCases: unknown[] = [
  undefined,
  null,
  "policy-a",
  {},
  { policyId: "" },
  { policyId: "policy-a" },
  { policyId: " policy-a " },
  { policyId: null },
  { policyId: undefined },
  { policyId: 0 },
  { policyId: false },
];
let metadataComparisons = 0;
for (const metadata of metadataCases) {
  assert.equal(
    transferPolicyIdFromOperationMetadata(metadata),
    v1TransferPolicyIdFromMetadata(metadata),
    `metadata mismatch: ${String(metadata)}`,
  );
  metadataComparisons += 1;
}

const ids = ["policy-a", "policy-b", "", " policy-a ", "x' OR '1'='1"];
const itemIds: Array<string | null> = [...ids, null];
const policies: Array<LicensingTransferPolicySnapshot | null> = [
  null,
  ...ids.flatMap((policyId) => [
    { policyId, transferable: false },
    { policyId, transferable: true },
  ]),
];

let comparisons = 0;
for (const requestedPolicyId of ids) {
  for (const orderItemPolicyId of itemIds) {
    for (const policy of policies) {
      const expected = v1TransferAllowed({ requestedPolicyId, orderItemPolicyId, policy });
      const actual = isTransferAllowed({ requestedPolicyId, orderItemPolicyId, policy });
      assert.equal(actual, expected, JSON.stringify({ requestedPolicyId, orderItemPolicyId, policy }));
      comparisons += 1;
    }
  }
}

assert.equal(comparisons, 330);
assert.equal(metadataComparisons, 11);
console.log(`Licensing V1 transfer-policy differential GREEN: ${comparisons} decision outcomes + ${metadataComparisons} metadata coercions matched exactly`);
