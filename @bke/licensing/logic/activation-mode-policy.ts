import {
  ACTIVATION_CREDENTIALS,
  PRODUCT_ACTIVATION_MODES,
  type ActivationCredential,
  type ActivationModeChangeEvidence,
  type ActivationModeEvaluationResult,
  type ProductActivationMode,
} from "../contracts/activation-mode.contract";

export function isProductActivationMode(value: unknown): value is ProductActivationMode {
  return typeof value === "string" && (PRODUCT_ACTIVATION_MODES as readonly string[]).includes(value);
}

export function isActivationCredential(value: unknown): value is ActivationCredential {
  return typeof value === "string" && (ACTIVATION_CREDENTIALS as readonly string[]).includes(value);
}

export function allowsProductActivation(mode: unknown, credential: unknown): boolean {
  if (!isProductActivationMode(mode) || !isActivationCredential(credential)) return false;
  if (credential === "ACCOUNT") return mode === "ACCOUNT" || mode === "EITHER";
  return mode === "LICENSE_KEY" || mode === "EITHER";
}

export function evaluateProductActivationMode(
  mode: unknown,
  credential: unknown,
): ActivationModeEvaluationResult {
  if (!isProductActivationMode(mode)) {
    return { ok: false, reason: "INVALID_ACTIVATION_MODE" };
  }
  if (credential === "CLAIM_CODE") {
    return { ok: false, reason: "CLAIM_CODE_NOT_ACTIVATION_CREDENTIAL" };
  }
  if (!isActivationCredential(credential)) {
    return { ok: false, reason: "INVALID_CREDENTIAL_TYPE" };
  }
  if (!allowsProductActivation(mode, credential)) {
    return { ok: false, reason: "ACTIVATION_MODE_MISMATCH" };
  }
  return { ok: true, mode, credential };
}

export function assertSafeProductActivationModeChange(evidence: ActivationModeChangeEvidence): void {
  if (!isProductActivationMode(evidence.previousMode) || !isProductActivationMode(evidence.requestedMode)) {
    throw new Error("PRODUCT_ACTIVATION_MODE_INVALID");
  }
  if (evidence.previousMode === evidence.requestedMode) return;
  if (
    evidence.active ||
    evidence.publishedAt !== null ||
    evidence.publishedEver !== false ||
    !Number.isSafeInteger(evidence.versionsCount) ||
    evidence.versionsCount < 0 ||
    !Number.isSafeInteger(evidence.licensesCount) ||
    evidence.licensesCount < 0 ||
    !Number.isSafeInteger(evidence.subscriptionsCount) ||
    evidence.subscriptionsCount < 0 ||
    !Number.isSafeInteger(evidence.orderItemsCount) ||
    evidence.orderItemsCount < 0 ||
    evidence.versionsCount !== 0 ||
    evidence.licensesCount !== 0 ||
    evidence.subscriptionsCount !== 0 ||
    evidence.orderItemsCount !== 0
  ) {
    throw new Error("PRODUCT_ACTIVATION_MODE_LOCKED");
  }
}
