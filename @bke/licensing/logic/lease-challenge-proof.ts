import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import {
  ACCOUNT_PRODUCT_LEASE_ACTIONS,
  type AccountProductLeaseAction,
} from "../contracts/account-product-lease.contract";
import {
  LEASE_CHALLENGE_PROOF_SCHEMA,
  type LeaseChallengeConsumeResult,
  type LeaseChallengeRecord,
  type LeaseChallengeStore,
  type LeaseChallengeVerificationResult,
} from "../contracts/lease-challenge-proof.contract";
import { spkiThumbprint } from "../providers/ed25519-account-product-lease";

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const BOUNDED_ID = /^[A-Za-z0-9._-]{1,128}$/;
const THUMBPRINT = /^[A-Za-z0-9_-]{43}$/;
const DEFAULT_TTL_MS = 30_000;

function validId(value: unknown, max = 128): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;
}

function validAction(value: unknown): value is AccountProductLeaseAction {
  return typeof value === "string" && (ACCOUNT_PRODUCT_LEASE_ACTIONS as readonly string[]).includes(value);
}

function decodeBase64Url(value: unknown, maxLen: number): Buffer | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLen || !BASE64URL.test(value)) {
    return null;
  }
  const bytes = Buffer.from(value, "base64url");
  return bytes.toString("base64url") === value ? bytes : null;
}

export function buildLeaseChallengeMessage(input: Readonly<{
  challengeId: string;
  accountId: string;
  userId: string;
  productId: string;
  agentSessionId: string;
  agentKeyThumbprint: string;
  action: AccountProductLeaseAction;
  nonce: string;
}>): Buffer {
  const message = [
    LEASE_CHALLENGE_PROOF_SCHEMA,
    input.challengeId,
    input.accountId,
    input.userId,
    input.productId,
    input.agentSessionId,
    input.agentKeyThumbprint,
    input.action,
    input.nonce,
  ].join("\n");
  return Buffer.from(message, "utf8");
}

export function signLeaseChallengeProof(
  messageBase64url: string,
  privateKeyPem: string,
): string {
  const message = decodeBase64Url(messageBase64url, 4096);
  if (!message) throw new Error("LEASE_CHALLENGE_MESSAGE_INVALID");
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("LEASE_CHALLENGE_SIGNING_KEY_INVALID");
  }
  return sign(null, message, privateKey).toString("base64url");
}

export async function issueLeaseChallenge(
  store: LeaseChallengeStore,
  input: Readonly<{
    challengeId?: string;
    nonce?: string;
    accountId: string;
    userId: string;
    productId: string;
    agentSessionId: string;
    agentKeyThumbprint: string;
    action: AccountProductLeaseAction;
    now: Date;
    ttlMs?: number;
  }>,
): Promise<Readonly<{ record: LeaseChallengeRecord; messageBase64url: string }>> {
  const challengeId = input.challengeId ?? randomUUID();
  const nonce = input.nonce ?? randomBytes(32).toString("base64url");
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  if (
    !BOUNDED_ID.test(challengeId) ||
    !validId(input.accountId) ||
    !validId(input.userId) ||
    !validId(input.productId) ||
    !validId(input.agentSessionId) ||
    !THUMBPRINT.test(input.agentKeyThumbprint) ||
    !validAction(input.action) ||
    !BASE64URL.test(nonce) ||
    nonce.length < 16 ||
    nonce.length > 128 ||
    !(input.now instanceof Date) ||
    !Number.isFinite(input.now.getTime()) ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 1_000 ||
    ttlMs > 300_000
  ) {
    throw new Error("LEASE_CHALLENGE_INPUT_INVALID");
  }

  const messageBytes = buildLeaseChallengeMessage({
    challengeId,
    accountId: input.accountId,
    userId: input.userId,
    productId: input.productId,
    agentSessionId: input.agentSessionId,
    agentKeyThumbprint: input.agentKeyThumbprint,
    action: input.action,
    nonce,
  });
  const messageHash = createHash("sha256").update(messageBytes).digest("hex");
  const record: LeaseChallengeRecord = Object.freeze({
    challengeId,
    accountId: input.accountId,
    userId: input.userId,
    productId: input.productId,
    agentSessionId: input.agentSessionId,
    agentKeyThumbprint: input.agentKeyThumbprint,
    action: input.action,
    nonce,
    messageHash,
    createdAt: new Date(input.now.getTime()),
    expiresAt: new Date(input.now.getTime() + ttlMs),
    consumedAt: null,
  });
  await store.issueChallenge(record);
  return Object.freeze({
    record,
    messageBase64url: messageBytes.toString("base64url"),
  });
}

export async function verifyAndConsumeLeaseChallengeProof(
  store: LeaseChallengeStore,
  input: Readonly<{
    challengeId: string;
    messageBase64url: string;
    signatureBase64url: string;
    publicKeyPem: string;
    expected: Readonly<{
      accountId: string;
      userId: string;
      productId: string;
      agentSessionId: string;
      agentKeyThumbprint: string;
      action: AccountProductLeaseAction;
      now: Date;
    }>;
  }>,
): Promise<LeaseChallengeVerificationResult> {
  if (
    !BOUNDED_ID.test(input.challengeId) ||
    !(input.expected.now instanceof Date) ||
    !Number.isFinite(input.expected.now.getTime())
  ) {
    return { ok: false, reason: "INVALID_CHALLENGE" };
  }

  const messageBytes = decodeBase64Url(input.messageBase64url, 4096);
  const signatureBytes = decodeBase64Url(input.signatureBase64url, 128);
  if (!messageBytes || !signatureBytes || signatureBytes.length !== 64) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }

  let publicKey;
  let thumbprint: string;
  try {
    publicKey = createPublicKey(input.publicKeyPem);
    if (publicKey.asymmetricKeyType !== "ed25519") {
      return { ok: false, reason: "BAD_SIGNATURE" };
    }
    thumbprint = spkiThumbprint(publicKey);
  } catch {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }

  if (thumbprint !== input.expected.agentKeyThumbprint) {
    return { ok: false, reason: "SCOPE_MISMATCH" };
  }

  const consumed = await store.consumeChallengeAtomically({
    challengeId: input.challengeId,
    now: input.expected.now,
  });
  if (consumed.status === "NOT_FOUND" || consumed.status === "NOT_YET_VALID") {
    return { ok: false, reason: "INVALID_CHALLENGE" };
  }
  if (consumed.status === "ALREADY_CONSUMED") {
    return { ok: false, reason: "CHALLENGE_ALREADY_CONSUMED" };
  }
  if (consumed.status === "EXPIRED") {
    return { ok: false, reason: "CHALLENGE_EXPIRED" };
  }
  if (consumed.status !== "CONSUMED") {
    return { ok: false, reason: "INVALID_CHALLENGE" };
  }

  const record = consumed.record;
  if (
    record.accountId !== input.expected.accountId ||
    record.userId !== input.expected.userId ||
    record.productId !== input.expected.productId ||
    record.agentSessionId !== input.expected.agentSessionId ||
    record.agentKeyThumbprint !== input.expected.agentKeyThumbprint ||
    record.action !== input.expected.action
  ) {
    return { ok: false, reason: "SCOPE_MISMATCH" };
  }

  const expectedMessage = buildLeaseChallengeMessage(record);
  const messageHash = createHash("sha256").update(messageBytes).digest("hex");
  if (
    messageHash !== record.messageHash ||
    !messageBytes.equals(expectedMessage) ||
    !verify(null, messageBytes, publicKey, signatureBytes)
  ) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }

  return { ok: true, challengeId: record.challengeId, record };
}

export function createInMemoryLeaseChallengeStore(): LeaseChallengeStore {
  const records = new Map<string, LeaseChallengeRecord>();
  return Object.freeze({
    async issueChallenge(record: LeaseChallengeRecord): Promise<void> {
      if (records.has(record.challengeId)) {
        throw new Error("LEASE_CHALLENGE_ID_CONFLICT");
      }
      records.set(record.challengeId, record);
    },

    async consumeChallengeAtomically(input: Readonly<{
      challengeId: string;
      now: Date;
    }>): Promise<LeaseChallengeConsumeResult> {
      const existing = records.get(input.challengeId);
      if (!existing) return { status: "NOT_FOUND" };
      const nowMs = input.now.getTime();
      if (existing.createdAt.getTime() > nowMs) return { status: "NOT_YET_VALID" };
      if (existing.consumedAt !== null) return { status: "ALREADY_CONSUMED" };
      if (existing.expiresAt.getTime() <= nowMs) return { status: "EXPIRED" };
      const updated: LeaseChallengeRecord = Object.freeze({
        ...existing,
        consumedAt: new Date(nowMs),
      });
      records.set(existing.challengeId, updated);
      return { status: "CONSUMED", record: updated };
    },
  });
}
