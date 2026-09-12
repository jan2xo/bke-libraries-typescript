export const PRIVACY_REQUEST_POLICY_CAPABILITY_ID = "privacy.request-policy.v1" as const;

export const PRIVACY_REQUEST_TYPES = ["ACCESS", "CORRECTION", "EXPORT", "DELETION", "RESTRICTION", "OBJECTION", "BREACH_REPORT"] as const;
export type PrivacyRequestType = typeof PRIVACY_REQUEST_TYPES[number];

export const PRIVACY_REQUEST_STATUSES = ["OPEN", "IN_REVIEW", "FULFILLED", "REJECTED", "CANCELLED"] as const;
export type PrivacyRequestStatus = typeof PRIVACY_REQUEST_STATUSES[number];
export type PrivacyRequestTransitionStatus = Exclude<PrivacyRequestStatus, "OPEN">;

export type PrivacyRequestNetworkSnapshot = Readonly<{
  ipAddress: string;
  userAgent: string | null;
}>;

export type PrivacyRequestCreationPlan = Readonly<{
  request: Readonly<{
    userId: string;
    accountId: string | null;
    requestType: PrivacyRequestType;
    status: "OPEN";
    summary: string;
    ipAddress: string;
    userAgent: string | null;
  }>;
  event: Readonly<{
    actorId: string;
    eventType: "CREATED";
    toStatus: "OPEN";
    metadata: Readonly<{ requestType: PrivacyRequestType }>;
  }>;
  audit: Readonly<{
    actorId: string;
    accountId: string | null;
    action: "PRIVACY_REQUEST_CREATED";
    targetType: "PrivacyRequest";
    metadata: Readonly<{ requestType: PrivacyRequestType }>;
  }>;
}>;

export type PrivacyRequestTransitionPlan = Readonly<{
  update: Readonly<{
    status: PrivacyRequestTransitionStatus;
    responseSummary: string;
    reviewedById: string;
    shouldClose: boolean;
  }>;
  event: Readonly<{
    actorId: string;
    eventType: "STATUS_CHANGED";
    fromStatus: PrivacyRequestStatus;
    toStatus: PrivacyRequestTransitionStatus;
    metadata: Readonly<{ responseSummaryLength: number }>;
  }>;
  audit: Readonly<{
    actorId: string;
    accountId: string | null;
    action: "PRIVACY_REQUEST_STATUS_CHANGED";
    targetType: "PrivacyRequest";
    metadata: Readonly<{ from: PrivacyRequestStatus; to: PrivacyRequestTransitionStatus }>;
  }>;
}>;
