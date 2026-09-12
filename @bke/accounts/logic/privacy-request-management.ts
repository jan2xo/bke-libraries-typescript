import {
  ACCOUNTS_PRIVACY_REQUEST_STATUSES,
  ACCOUNTS_PRIVACY_REQUEST_TYPES,
  type AccountsCreatePrivacyRequestInput,
  type AccountsPrivacyRequestManagementCapability,
  type AccountsPrivacyRequestManagementResult,
  type AccountsPrivacyRequestSnapshot,
  type AccountsTransitionPrivacyRequestInput,
} from "../contracts/privacy-request-management.contract";

export interface AccountsPrivacyRequestManagementRepository {
  create(input: {
    readonly userId: string;
    readonly customerAccountId: string | null;
    readonly requestType: AccountsCreatePrivacyRequestInput["requestType"];
    readonly summary: string;
    readonly ipAddress: string;
    readonly userAgent: string | null;
  }): Promise<AccountsPrivacyRequestSnapshot>;
  findById(requestId: string): Promise<AccountsPrivacyRequestSnapshot | null>;
  transition(input: {
    readonly actorId: string;
    readonly requestId: string;
    readonly fromStatus: AccountsPrivacyRequestSnapshot["status"];
    readonly toStatus: AccountsTransitionPrivacyRequestInput["status"];
    readonly responseSummary: string;
    readonly closedAt: Date | null;
    readonly reviewedAt: Date;
  }): Promise<AccountsPrivacyRequestSnapshot>;
}

function failed(
  code: Extract<AccountsPrivacyRequestManagementResult, { status: "FAILED" }>["code"],
): AccountsPrivacyRequestManagementResult {
  return { status: "FAILED", code };
}

function normalizeCreateInput(input: AccountsCreatePrivacyRequestInput) {
  if (!ACCOUNTS_PRIVACY_REQUEST_TYPES.includes(input.requestType)) {
    return failed("INVALID_PRIVACY_REQUEST_TYPE");
  }
  if (!input.userId.trim() || !input.summary.trim() || !input.ipAddress.trim()) {
    return failed("INVALID_INPUT");
  }
  return {
    userId: input.userId.trim(),
    customerAccountId: input.customerAccountId?.trim() || null,
    requestType: input.requestType,
    summary: input.summary.slice(0, 2_000),
    ipAddress: input.ipAddress.slice(0, 128),
    userAgent: input.userAgent?.slice(0, 500) ?? null,
  };
}

function isClosed(status: AccountsPrivacyRequestSnapshot["status"]) {
  return status === "FULFILLED" || status === "REJECTED" || status === "CANCELLED";
}

export function createAccountsPrivacyRequestManagementCapability(
  repository: AccountsPrivacyRequestManagementRepository,
): AccountsPrivacyRequestManagementCapability {
  return Object.freeze({
    async create(input) {
      const normalized = normalizeCreateInput(input);
      if ("status" in normalized) return normalized;
      try {
        return { status: "OK", value: await repository.create(normalized) };
      } catch {
        return failed("PERSISTENCE_UNAVAILABLE");
      }
    },

    async transition(input) {
      if (!input.actorId.trim() || !input.requestId.trim()) return failed("INVALID_INPUT");
      if (!ACCOUNTS_PRIVACY_REQUEST_STATUSES.includes(input.status)) return failed("INVALID_INPUT");
      try {
        const current = await repository.findById(input.requestId.trim());
        if (!current) return { status: "NOT_FOUND" };
        if (isClosed(current.status)) return failed("PRIVACY_REQUEST_CLOSED");
        const responseSummary = input.responseSummary.slice(0, 2_000);
        if (input.status === "FULFILLED" && responseSummary.trim().length < 10) {
          return failed("PRIVACY_RESPONSE_REQUIRED");
        }
        const reviewedAt = new Date();
        return {
          status: "OK",
          value: await repository.transition({
            actorId: input.actorId.trim(),
            requestId: input.requestId.trim(),
            fromStatus: current.status,
            toStatus: input.status,
            responseSummary,
            reviewedAt,
            closedAt: isClosed(input.status) ? reviewedAt : null,
          }),
        };
      } catch {
        return failed("PERSISTENCE_UNAVAILABLE");
      }
    },
  });
}
