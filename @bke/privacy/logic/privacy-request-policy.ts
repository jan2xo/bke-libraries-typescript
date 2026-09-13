import type {
  PrivacyRequestCreationPlan,
  PrivacyRequestNetworkSnapshot,
  PrivacyRequestStatus,
  PrivacyRequestTransitionPlan,
  PrivacyRequestTransitionStatus,
  PrivacyRequestType,
} from "../contracts/privacy-request-policy.contract";
import { PRIVACY_REQUEST_TYPES } from "../contracts/privacy-request-policy.contract";

const CLOSED_STATUSES = new Set<PrivacyRequestStatus>(["FULFILLED", "REJECTED", "CANCELLED"]);

export function normalizePrivacyRequestType(value: string): PrivacyRequestType {
  if ((PRIVACY_REQUEST_TYPES as readonly string[]).includes(value)) return value as PrivacyRequestType;
  throw new Error("INVALID_PRIVACY_REQUEST_TYPE");
}

export function normalizePrivacyRequestNetworkSnapshot(input: PrivacyRequestNetworkSnapshot): PrivacyRequestNetworkSnapshot {
  return {
    ipAddress: input.ipAddress.slice(0, 128),
    userAgent: input.userAgent?.slice(0, 500) ?? null,
  };
}

export function planPrivacyRequestCreation(input: Readonly<{
  userId: string;
  accountId?: string | null;
  requestType: PrivacyRequestType;
  summary: string;
  network: PrivacyRequestNetworkSnapshot;
}>): PrivacyRequestCreationPlan {
  const network = normalizePrivacyRequestNetworkSnapshot(input.network);
  const accountId = input.accountId ?? null;
  const metadata = { requestType: input.requestType } as const;
  return {
    request: {
      userId: input.userId,
      accountId,
      requestType: input.requestType,
      status: "OPEN",
      summary: input.summary.slice(0, 2_000),
      ipAddress: network.ipAddress,
      userAgent: network.userAgent,
    },
    event: {
      actorId: input.userId,
      eventType: "CREATED",
      toStatus: "OPEN",
      metadata,
    },
    audit: {
      actorId: input.userId,
      accountId,
      action: "PRIVACY_REQUEST_CREATED",
      targetType: "PrivacyRequest",
      metadata,
    },
  };
}

export function planPrivacyRequestTransition(input: Readonly<{
  actorId: string;
  accountId?: string | null;
  currentStatus: PrivacyRequestStatus;
  targetStatus: PrivacyRequestTransitionStatus;
  responseSummary: string;
}>): PrivacyRequestTransitionPlan {
  if (CLOSED_STATUSES.has(input.currentStatus)) throw new Error("PRIVACY_REQUEST_CLOSED");
  const responseSummaryLength = input.responseSummary.trim().length;
  if (input.targetStatus === "FULFILLED" && responseSummaryLength < 10) throw new Error("PRIVACY_RESPONSE_REQUIRED");
  const responseSummary = input.responseSummary.slice(0, 2_000);
  const accountId = input.accountId ?? null;
  const shouldClose = CLOSED_STATUSES.has(input.targetStatus);
  return {
    update: {
      status: input.targetStatus,
      responseSummary,
      reviewedById: input.actorId,
      shouldClose,
    },
    event: {
      actorId: input.actorId,
      eventType: "STATUS_CHANGED",
      fromStatus: input.currentStatus,
      toStatus: input.targetStatus,
      metadata: { responseSummaryLength },
    },
    audit: {
      actorId: input.actorId,
      accountId,
      action: "PRIVACY_REQUEST_STATUS_CHANGED",
      targetType: "PrivacyRequest",
      metadata: { from: input.currentStatus, to: input.targetStatus },
    },
  };
}
