export const LICENSING_ACTIVATION_MODE_CAPABILITY_ID =
  "bke.licensing.activation-mode.v1" as const;

export const PRODUCT_ACTIVATION_MODES = ["ACCOUNT", "LICENSE_KEY", "EITHER"] as const;
export type ProductActivationMode = (typeof PRODUCT_ACTIVATION_MODES)[number];

export const ACTIVATION_CREDENTIALS = ["ACCOUNT", "LICENSE_KEY"] as const;
export type ActivationCredential = (typeof ACTIVATION_CREDENTIALS)[number];

export type ActivationModeEvaluationResult =
  | Readonly<{ ok: true; mode: ProductActivationMode; credential: ActivationCredential }>
  | Readonly<{
      ok: false;
      reason:
        | "INVALID_ACTIVATION_MODE"
        | "CLAIM_CODE_NOT_ACTIVATION_CREDENTIAL"
        | "INVALID_CREDENTIAL_TYPE"
        | "ACTIVATION_MODE_MISMATCH";
    }>;

export type ActivationModeChangeEvidence = Readonly<{
  previousMode: string;
  requestedMode: string;
  active: boolean;
  publishedAt: Date | null;
  publishedEver: boolean;
  versionsCount: number;
  licensesCount: number;
  subscriptionsCount: number;
  orderItemsCount: number;
}>;
