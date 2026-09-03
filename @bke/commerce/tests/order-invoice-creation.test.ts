import { describe, expect, it } from "vitest";
import type { CommerceOrderInvoiceCreationRepository } from "../logic/order-invoice-creation-repository";
import {
  calculateCommerceOrderLineTotal,
  calculateCommerceOrderTotals,
  createCommerceOrderInvoiceCreationCapability,
} from "../logic/order-invoice-creation";

const validInput = {
  accountId: "account-1",
  orderNumber: "ORD-1001",
  invoiceNumber: "INV-1001",
  currency: "php",
  taxMinor: 120,
  billingSnapshot: { billingEmail: "buyer@example.com" },
  customerSnapshot: { displayName: "Buyer" },
  lines: [
    {
      productId: "product-1",
      priceId: "price-1",
      policyId: "policy-1",
      productName: "Air Stack",
      priceName: "Annual",
      description: "Air Stack Annual",
      quantity: 2,
      unitAmountMinor: 1000,
      billingType: "SUBSCRIPTION" as const,
      policySnapshot: { devices: 1 },
      editionId: "edition-1",
      purchasePlanId: "plan-1",
      offerDiscountMinor: 200,
      pricingVersion: "pricing-v1",
    },
  ],
};

describe("Commerce order + invoice creation", () => {
  it("calculates immutable line totals after offer discount", () => {
    expect(calculateCommerceOrderLineTotal(validInput.lines[0]!)).toBe(1800);
  });

  it("calculates subtotal + tax total safely", () => {
    expect(calculateCommerceOrderTotals(validInput)).toEqual({ subtotalMinor: 1800, totalMinor: 1920 });
  });

  it("rejects impossible discounts", () => {
    expect(
      calculateCommerceOrderLineTotal({ quantity: 1, unitAmountMinor: 100, offerDiscountMinor: 101 }),
    ).toBeNull();
  });

  it("normalizes identifiers and currency before persistence", async () => {
    let received: unknown;
    const repository: CommerceOrderInvoiceCreationRepository = {
      async create(input) {
        received = input;
        return {
          status: "CREATED",
          value: {
            orderId: "order-1",
            orderNumber: input.orderNumber,
            orderStatus: "PENDING",
            invoiceId: "invoice-1",
            invoiceNumber: input.invoiceNumber,
            invoiceStatus: "DRAFT",
            currency: input.currency,
            subtotalMinor: 1800,
            taxMinor: 120,
            totalMinor: 1920,
            lineCount: 1,
          },
        };
      },
    };
    const capability = createCommerceOrderInvoiceCreationCapability(repository);
    const result = await capability.create({ ...validInput, accountId: " account-1 ", currency: " php " });
    expect(result.status).toBe("CREATED");
    expect(received).toMatchObject({ accountId: "account-1", currency: "PHP" });
  });

  it("fails closed on invalid monetary input", async () => {
    const repository: CommerceOrderInvoiceCreationRepository = {
      async create() {
        throw new Error("must not be reached");
      },
    };
    const capability = createCommerceOrderInvoiceCreationCapability(repository);
    const result = await capability.create({
      ...validInput,
      lines: [{ ...validInput.lines[0]!, quantity: 0 }],
    });
    expect(result).toEqual({ status: "FAILED", code: "INVALID_INPUT" });
  });
});
