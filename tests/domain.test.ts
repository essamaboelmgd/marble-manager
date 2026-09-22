import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/domain/database";
import {
  cancelInvoice,
  createCustomer,
  createExpense,
  createProduct,
  createPurchase,
  createSale,
  getAccountBalance,
  getCustomerBalance,
  getInvoiceDetails,
  getProduct,
  getSetupIds,
  recordPayment,
  seedDefaults,
} from "../src/domain/services";
import type { Database } from "better-sqlite3";

describe("marble inventory and finance transactions", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  function createFixture() {
    db = createDatabase(":memory:");
    seedDefaults(db);
    const ids = getSetupIds(db);
    const customer = createCustomer(db, {
      name: "عميل تجريبي",
      phone: "01000000000",
      address: "القاهرة",
    });
    const supplier = createCustomer(db, {
      name: "مورد تجريبي",
      phone: "01100000000",
      address: "الجيزة",
      kind: "supplier",
    });
    const product = createProduct(db, {
      name: "رخام أبيض",
      unitId: ids.cubicMeterUnitId,
      purchasePriceMinor: 200000,
      salePriceMinor: 400000,
      minStockQtyScaled: 1000,
    });

    return { ids, customer, supplier, product };
  }

  it("increases stock and supplier payable when a purchase is posted", () => {
    const { ids, supplier, product } = createFixture();

    const invoice = createPurchase(db, {
      supplierId: supplier.id,
      accountId: ids.cashAccountId,
      items: [{ productId: product.id, qtyScaled: 5000, unitPriceMinor: 200000 }],
      paidMinor: 400000,
    });

    expect(invoice.totalMinor).toBe(1000000);
    expect(getProduct(db, product.id)?.stockQtyScaled).toBe(5000);
    expect(getCustomerBalance(db, supplier.id, "supplier")).toBe(600000);
    expect(getAccountBalance(db, ids.cashAccountId)).toBe(-400000);
  });

  it("decreases stock and records receivable while extra lines do not touch stock", () => {
    const { ids, customer, supplier, product } = createFixture();
    createPurchase(db, {
      supplierId: supplier.id,
      accountId: ids.cashAccountId,
      items: [{ productId: product.id, qtyScaled: 5000, unitPriceMinor: 200000 }],
      paidMinor: 0,
    });

    const invoice = createSale(db, {
      customerId: customer.id,
      accountId: ids.cashAccountId,
      items: [
        { kind: "stock", productId: product.id, qtyScaled: 2000, unitPriceMinor: 400000 },
        { kind: "extra", name: "تركيب", qtyScaled: 1000, unitPriceMinor: 50000 },
      ],
      paidMinor: 300000,
    });

    expect(invoice.totalMinor).toBe(850000);
    expect(getProduct(db, product.id)?.stockQtyScaled).toBe(3000);
    expect(getCustomerBalance(db, customer.id, "customer")).toBe(550000);
    expect(getAccountBalance(db, ids.cashAccountId)).toBe(300000);
  });

  it("rejects insufficient stock without leaving partial invoice, stock, or ledger writes", () => {
    const { ids, customer, supplier, product } = createFixture();
    createPurchase(db, {
      supplierId: supplier.id,
      accountId: ids.cashAccountId,
      items: [{ productId: product.id, qtyScaled: 5000, unitPriceMinor: 200000 }],
      paidMinor: 0,
    });

    expect(() =>
      createSale(db, {
        customerId: customer.id,
        accountId: ids.cashAccountId,
        items: [{ kind: "stock", productId: product.id, qtyScaled: 6000, unitPriceMinor: 400000 }],
        paidMinor: 100000,
      }),
    ).toThrow(/المخزون غير كاف/);

    expect(getProduct(db, product.id)?.stockQtyScaled).toBe(5000);
    expect(getCustomerBalance(db, customer.id, "customer")).toBe(0);
    expect(getAccountBalance(db, ids.cashAccountId)).toBe(0);
  });

  it("reduces receivable and increases cash when a customer pays later", () => {
    const { ids, customer, supplier, product } = createFixture();
    createPurchase(db, {
      supplierId: supplier.id,
      accountId: ids.cashAccountId,
      items: [{ productId: product.id, qtyScaled: 5000, unitPriceMinor: 200000 }],
      paidMinor: 0,
    });
    const invoice = createSale(db, {
      customerId: customer.id,
      accountId: ids.cashAccountId,
      items: [{ kind: "stock", productId: product.id, qtyScaled: 2000, unitPriceMinor: 400000 }],
      paidMinor: 200000,
    });

    recordPayment(db, {
      invoiceType: "sale",
      invoiceId: invoice.id,
      accountId: ids.cashAccountId,
      amountMinor: 300000,
      method: "cash",
    });

    expect(getCustomerBalance(db, customer.id, "customer")).toBe(300000);
    expect(getAccountBalance(db, ids.cashAccountId)).toBe(500000);
  });

  it("reduces the selected account when an expense is recorded", () => {
    const { ids } = createFixture();

    createExpense(db, {
      accountId: ids.cashAccountId,
      category: "نقل",
      amountMinor: 150000,
      notes: "نقل خامة",
    });

    expect(getAccountBalance(db, ids.cashAccountId)).toBe(-150000);
  });

  it("cancels a sale by reversing stock, receivable, and payment movements", () => {
    const { ids, customer, supplier, product } = createFixture();
    createPurchase(db, {
      supplierId: supplier.id,
      accountId: ids.cashAccountId,
      items: [{ productId: product.id, qtyScaled: 5000, unitPriceMinor: 200000 }],
      paidMinor: 0,
    });
    const invoice = createSale(db, {
      customerId: customer.id,
      accountId: ids.cashAccountId,
      items: [{ kind: "stock", productId: product.id, qtyScaled: 2000, unitPriceMinor: 400000 }],
      paidMinor: 300000,
    });

    cancelInvoice(db, { invoiceType: "sale", invoiceId: invoice.id });

    expect(getProduct(db, product.id)?.stockQtyScaled).toBe(5000);
    expect(getCustomerBalance(db, customer.id, "customer")).toBe(0);
    expect(getAccountBalance(db, ids.cashAccountId)).toBe(0);
  });

  it("calculates dimension-based purchase quantity and supports the remaining supplier payment", () => {
    const { ids, supplier, product } = createFixture();
    const invoice = createPurchase(db, {
      supplierId: supplier.id,
      accountId: ids.cashAccountId,
      items: [{ productId: product.id, width: 2.5, height: 2, unitPriceMinor: 10000 }],
      paidMinor: 5000,
    });

    expect(invoice.totalMinor).toBe(50000);
    expect(getProduct(db, product.id)?.stockQtyScaled).toBe(5000);
    expect(getInvoiceDetails(db, { invoiceType: "purchase", invoiceId: invoice.id }).items[0]).toMatchObject({
      width: 2.5,
      height: 2,
      qtyScaled: 5000,
      totalMinor: 50000,
    });
    expect(getCustomerBalance(db, supplier.id, "supplier")).toBe(45000);

    recordPayment(db, {
      invoiceType: "purchase",
      invoiceId: invoice.id,
      accountId: ids.cashAccountId,
      amountMinor: 45000,
      method: "cash",
    });

    expect(getInvoiceDetails(db, { invoiceType: "purchase", invoiceId: invoice.id }).remainingMinor).toBe(0);
    expect(getCustomerBalance(db, supplier.id, "supplier")).toBe(0);
  });

  it("calculates sale totals from width and height without requiring an extra line", () => {
    const { ids, customer, supplier, product } = createFixture();
    createPurchase(db, {
      supplierId: supplier.id,
      accountId: ids.cashAccountId,
      items: [{ productId: product.id, width: 2.5, height: 2, unitPriceMinor: 10000 }],
    });
    const invoice = createSale(db, {
      customerId: customer.id,
      accountId: ids.cashAccountId,
      items: [{ kind: "stock", productId: product.id, width: 1, height: 2, unitPriceMinor: 40000 }],
      paidMinor: 5000,
    });

    expect(invoice.totalMinor).toBe(80000);
    expect(getProduct(db, product.id)?.stockQtyScaled).toBe(3000);
    expect(getInvoiceDetails(db, { invoiceType: "sale", invoiceId: invoice.id }).remainingMinor).toBe(75000);
  });
});
