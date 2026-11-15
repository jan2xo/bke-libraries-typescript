import type { AccountProductLeaseAction } from "./account-product-lease.contract";

export const LICENSING_CHALLENGE_PROOF_CAPABILITY_ID =
  "bke.licensing.lease-challenge-proof.v1" as const;
export const LEASE_CHALLENGE_PROOF_SCHEMA = "bke.lease-challenge.v1" as const;

export type LeaseChallengeRecord = Readonly<{
  challengeId: string;
  accountId: string;
  userId: string;
  productId: string;
  agentSessionId: string;
  agentKeyThumbprint: string;
  action: AccountProductLeaseAction;
  nonce: string;
  messageHash: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}>;

export type LeaseChallengeConsumeResult =
  | Readonly<{ status: "CONSUMED"; record: LeaseChallengeRecord }>
  | Readonly<{ status: "NOT_FOUND" | "ALREADY_CONSUMED" | "EXPIRED" | "NOT_YET_VALID" }>;

export interface LeaseChallengeStore {
  issueChallenge(record: LeaseChallengeRecord): Promise<void>;
  consumeChallengeAtomically(input: Readonly<{
    challengeId: string;
    now: Date;
  }>): Promise<LeaseChallengeConsumeResult>;
}

export type LeaseChallengeVerificationResult =
  | Readonly<{ ok: true; challengeId: string; record: LeaseChallengeRecord }>
  | Readonly<{
      ok: false;
      reason:
        | "INVALID_CHALLENGE"
        | "CHALLENGE_ALREADY_CONSUMED"
        | "CHALLENGE_EXPIRED"
        | "SCOPE_MISMATCH"
        | "BAD_SIGNATURE";
    }>;
