import type { CommerceCheckoutLegalRequirementInput, CommerceCheckoutPayerInput } from "../contracts/checkout-orchestration.contract";

export interface CommerceAccountPurchaseAuthorizer {
  authorize(input: {
    readonly principalId: string;
    readonly accountId: string;
  }): Promise<
    | { readonly status: "AUTHORIZED" }
    | { readonly status: "REJECTED" }
    | { readonly status: "FAILED" }
  >;
}

export interface CommerceLegalAcceptanceChecker {
  check(input: {
    readonly principalId: string;
    readonly accountId: string;
    readonly requirement: CommerceCheckoutLegalRequirementInput;
  }): Promise<
    | { readonly status: "ACCEPTED" }
    | { readonly status: "NOT_ACCEPTED" }
    | { readonly status: "FAILED" }
  >;
}

export interface CommercePaymentCheckoutStarter {
  create(input: {
    readonly sourceReference: string;
    readonly commercialReference: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly payer: CommerceCheckoutPayerInput;
    readonly items: readonly {
      readonly name: string;
      readonly description?: string;
      readonly amountMinor: number;
      readonly quantity: number;
    }[];
  }): Promise<
    | {
        readonly status: "READY";
        readonly value: {
          readonly attemptId: string;
          readonly provider: string;
          readonly externalCheckoutId: string;
          readonly checkoutUrl: string;
          readonly amountMinor: number;
          readonly currency: string;
        };
      }
    | { readonly status: "REJECTED" }
    | {
        readonly status: "FAILED";
        readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" | "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED";
      }
  >;
}
