export interface LicensingLicenseKeyRevealRecord {
  readonly id: string;
  readonly accountId: string;
  readonly keyCiphertext: string | null;
  readonly keyRevealedAt: Date | null;
}

export interface LicensingLicenseKeyRevealRepository {
  findByIdAndAccount(input: {
    readonly licenseId: string;
    readonly accountId: string;
  }): Promise<LicensingLicenseKeyRevealRecord | null>;

  recordSuccessfulReveal(input: {
    readonly licenseId: string;
    readonly accountId: string;
    readonly actorPrincipalId: string;
    readonly revealedAt: Date;
  }): Promise<
    | {
        readonly status: "RECORDED";
        readonly keyRevealedAt: Date;
        readonly firstReveal: boolean;
      }
    | { readonly status: "NOT_FOUND" }
  >;
}
