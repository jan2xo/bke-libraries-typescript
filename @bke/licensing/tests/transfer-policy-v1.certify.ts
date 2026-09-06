import assert from "node:assert/strict";
import { isTransferAllowed, type LicensingTransferPolicySnapshot } from "../contracts/transfer-policy.contract";

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
console.log(`Licensing V1 transfer-policy differential GREEN: ${comparisons} outcomes matched exactly`);
