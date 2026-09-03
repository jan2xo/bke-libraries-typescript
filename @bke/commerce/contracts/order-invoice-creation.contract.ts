export const COMMERCE_ORDER_INVOICE_CREATION_CAPABILITY_ID =
  "bke.commerce.order-invoice-creation.v1" as const;

export interface CommerceOrderInvoiceLineInput {
  readonly productId: string;
  readonly priceId: string;
  readonly policyId: string;
  readonly productName: string;
  readonly priceName: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitAmountMinor: number;
  readonly billingType: "ONE_TIME" | "SUBSCRIPTION";
  readonly policySnapshot: unknown;
  readonly editionId?: string | null;
  readonly purchasePlanId?: string | null;
  readonly planName?: string | null;
  readonly planType?: "PERPETUAL" | "MONTHLY" | "ANNUAL" | null;
  readonly intervalUnit?: "MONTH" | "YEAR" | null;
  readonly intervalCount?: number | null;
  readonly renewalBehavior?: "NONE" | "CUSTOMER_AUTHORIZED" | null;
  readonly entitlementSnapshot?: unknown;
  readonly pricingSnapshot?: unknown;
  readonly catalogAmountMinor?: number | null;
  readonly offerId?: string | null;
  readonly offerDiscountBps?: number | null;
  readonly offerDiscountMinor?: number | null;
  readonly pricingVersion?: string | null;
}

export interface CommerceInvoicePresentationLineInput {
  readonly description: string;
  readonly quantity: number;
  readonly unitAmountMinor: number;
  readonly totalMinor: number;
}

export interface CommerceInvoicePresentationInput {
  readonly subtotalMinor: number;
  readonly lines: readonly CommerceInvoicePresentationLineInput[];
}

export interface CommerceCreateOrderInvoiceInput {
  readonly accountId: string;
  readonly orderNumber: string;
  readonly invoiceNumber: string;
  readonly currency: string;
  readonly taxMinor: number;
  readonly billingSnapshot: unknown;
  readonly customerSnapshot: unknown;
  readonly lines: readonly CommerceOrderInvoiceLineInput[];
  readonly invoicePresentation?: CommerceInvoicePresentationInput | null;
}

export interface CommerceOrderInvoiceSnapshot {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly orderStatus: "PENDING";
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly invoiceStatus: "DRAFT";
  readonly currency: string;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly lineCount: number;
}

export type CommerceCreateOrderInvoiceResult =
  | { readonly status: "CREATED"; readonly value: CommerceOrderInvoiceSnapshot }
  | { readonly status: "REJECTED"; readonly code: "DUPLICATE_NUMBER" }
  | { readonly status: "FAILED"; readonly code: "INVALID_INPUT" | "PERSISTENCE_UNAVAILABLE" };

export interface CommerceOrderInvoiceCreationCapability {
  create(input: CommerceCreateOrderInvoiceInput): Promise<CommerceCreateOrderInvoiceResult>;
}
