export const LICENSING_LICENSE_KEY_REVEAL_CAPABILITY_ID =
  "bke.licensing.license-key-reveal.v1" as const;

export interface LicensingLicenseKeyRevealInput {
  readonly licenseId: string;
  readonly accountId: string;
  readonly actorPrincipalId: string;
}

export type LicensingLicenseKeyRevealResult =
  | {
      readonly status: "REVEALED";
      readonly licenseId: string;
      readonly licenseKey: string;
      readonly keyRevealedAt: Date;
      readonly firstReveal: boolean;
      readonly event: {
        readonly type: "CUSTOMER_REVEALED";
        readonly metadata: { readonly actorId: string };
      };
    }
  | {
      readonly status: "REJECTED";
      readonly code: "NOT_FOUND" | "LICENSE_KEY_UNAVAILABLE";
    };

export interface LicensingLicenseKeyRevealCapability {
  reveal(input: LicensingLicenseKeyRevealInput): Promise<LicensingLicenseKeyRevealResult>;
}
