import type {
  CommerceCreateOrderInvoiceInput,
  CommerceCreateOrderInvoiceResult,
  CommerceOrderInvoiceCreationCapability,
} from "../contracts/order-invoice-creation.contract";
import type { CommerceOrderInvoiceCreationRepository } from "./order-invoice-creation-repository";

function validText(value: string, max: number): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max;
}

function validOptionalText(value: string | null | undefined, max = 256): boolean {
  return value === null || value === undefined || validText(value, max);
}

function isJsonSnapshot(value: unknown): boolean {
  return value !== undefined;
}

export function calculateCommerceOrderLineTotal(input: {
  readonly quantity: number;
  readonly unitAmountMinor: number;
  readonly offerDiscountMinor?: number | null;
}): number | null {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) return null;
  if (!Number.isSafeInteger(input.unitAmountMinor) || input.unitAmountMinor < 0) return null;
  const gross = input.quantity * input.unitAmountMinor;
  if (!Number.isSafeInteger(gross)) return null;
  const discount = input.offerDiscountMinor ?? 0;
  if (!Number.isSafeInteger(discount) || discount < 0 || discount > gross) return null;
  return gross - discount;
}

export function calculateCommerceOrderTotals(input: CommerceCreateOrderInvoiceInput): {
  readonly subtotalMinor: number;
  readonly totalMinor: number;
} | null {
  if (!Number.isSafeInteger(input.taxMinor) || input.taxMinor < 0) return null;
  let subtotalMinor = 0;
  for (const line of input.lines) {
    const lineTotal = calculateCommerceOrderLineTotal(line);
    if (lineTotal === null) return null;
    subtotalMinor += lineTotal;
    if (!Number.isSafeInteger(subtotalMinor)) return null;
  }
  const totalMinor = subtotalMinor + input.taxMinor;
  if (!Number.isSafeInteger(totalMinor)) return null;
  return { subtotalMinor, totalMinor };
}

function validateInput(input: CommerceCreateOrderInvoiceInput): boolean {
  if (
    !validText(input.accountId, 256) ||
    !validText(input.orderNumber, 128) ||
    !validText(input.invoiceNumber, 128) ||
    !validText(input.currency, 16) ||
    !isJsonSnapshot(input.billingSnapshot) ||
    !isJsonSnapshot(input.customerSnapshot) ||
    input.lines.length === 0 ||
    input.lines.length > 500
  ) {
    return false;
  }

  for (const line of input.lines) {
    if (
      !validText(line.productId, 256) ||
      !validText(line.priceId, 256) ||
      !validText(line.policyId, 256) ||
      !validText(line.productName, 512) ||
      !validText(line.priceName, 512) ||
      !validText(line.description, 1024) ||
      !validOptionalText(line.editionId) ||
      !validOptionalText(line.purchasePlanId) ||
      !validOptionalText(line.planName, 512) ||
      !validOptionalText(line.pricingVersion, 128) ||
      (line.intervalCount !== null && line.intervalCount !== undefined &&
        (!Number.isSafeInteger(line.intervalCount) || line.intervalCount <= 0)) ||
      (line.catalogAmountMinor !== null && line.catalogAmountMinor !== undefined &&
        (!Number.isSafeInteger(line.catalogAmountMinor) || line.catalogAmountMinor < 0)) ||
      (line.offerDiscountBps !== null && line.offerDiscountBps !== undefined &&
        (!Number.isSafeInteger(line.offerDiscountBps) || line.offerDiscountBps < 0 || line.offerDiscountBps > 10_000)) ||
      !isJsonSnapshot(line.policySnapshot) ||
      calculateCommerceOrderLineTotal(line) === null
    ) {
      return false;
    }
  }

  return calculateCommerceOrderTotals(input) !== null;
}

export function createCommerceOrderInvoiceCreationCapability(
  repository: CommerceOrderInvoiceCreationRepository,
): CommerceOrderInvoiceCreationCapability {
  return Object.freeze({
    async create(input: CommerceCreateOrderInvoiceInput): Promise<CommerceCreateOrderInvoiceResult> {
      if (!validateInput(input)) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      try {
        return await repository.create({
          ...input,
          accountId: input.accountId.trim(),
          orderNumber: input.orderNumber.trim(),
          invoiceNumber: input.invoiceNumber.trim(),
          currency: input.currency.trim().toUpperCase(),
          lines: input.lines.map((line) => ({
            ...line,
            productId: line.productId.trim(),
            priceId: line.priceId.trim(),
            policyId: line.policyId.trim(),
            productName: line.productName.trim(),
            priceName: line.priceName.trim(),
            description: line.description.trim(),
            editionId: line.editionId?.trim() || null,
            purchasePlanId: line.purchasePlanId?.trim() || null,
            planName: line.planName?.trim() || null,
            pricingVersion: line.pricingVersion?.trim() || null,
          })),
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
