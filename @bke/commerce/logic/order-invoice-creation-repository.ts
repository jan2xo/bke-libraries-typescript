import type {
  CommerceCreateOrderInvoiceInput,
  CommerceCreateOrderInvoiceResult,
} from "../contracts/order-invoice-creation.contract";

export interface CommerceOrderInvoiceCreationRepository {
  create(input: CommerceCreateOrderInvoiceInput): Promise<CommerceCreateOrderInvoiceResult>;
}
