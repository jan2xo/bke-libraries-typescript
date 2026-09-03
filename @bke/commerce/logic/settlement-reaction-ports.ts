export interface CommerceVerifiedSettlementFact {
  readonly settlementFactId: string;
  readonly commercialReference: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly settledAt: Date;
}

export interface CommercePaymentsSettlementReconciler {
  reconcile(input: {
    readonly providerEventRecordId: string;
    readonly expectedLivemode: boolean;
  }): Promise<
    | { readonly status: "SETTLED"; readonly value: CommerceVerifiedSettlementFact }
    | { readonly status: "REJECTED" }
    | { readonly status: "FAILED" }
  >;
}

export interface CommerceSettlementEntitlementInput {
  readonly subjectId: string;
  readonly resourceId: string;
  readonly sourceReference: string;
  readonly quantity: number;
  readonly scopeSnapshot: unknown;
  readonly grantSnapshot: unknown;
  readonly validFrom: Date;
}

export interface CommerceEntitlementGranter {
  grant(input: CommerceSettlementEntitlementInput): Promise<
    | { readonly status: "GRANTED" | "EXISTING" }
    | { readonly status: "REJECTED" }
    | { readonly status: "FAILED" }
  >;
}
