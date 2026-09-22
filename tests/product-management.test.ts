import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/domain/database";
import {
  createCustomer,
  createProduct,
  createPurchase,
  createSale,
  deleteProduct,
  getProduct,
  getSetupIds,
  listProducts,
  seedDefaults,
  updateProduct,
} from "../src/domain/services";
import type { Database } from "better-sqlite3";

describe("product management and weighted inventory cost", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  function createFixture() {
    db = createDatabase(":memory:");
    seedDefaults(db);
    const ids = getSetupIds(db);
    const supplier = createCustomer(db, { name: "مورد", kind: "supplier" });
    const customer = createCustomer(db, { name: "عميل" });
    const product = createProduct(db, {
      name: "رخام أبيض",
      unitId: ids.squareMeterUnitId,
      purchasePriceMinor: 10000,
      salePriceMinor: 12000,
    });
    return { ids, supplier, customer, product };
  }

  it("calculates moving weighted average cost and weighted average realized sale price", () => {
    const { ids, supplier, customer, product } = createFixture();

    createPurchase(db, {
      supplierId: supplier.id,
      accountId: ids.cashAccountId,
      items: [{ productId: product.id, qtyScaled: 100000, unitPriceMinor: 10000 }],
    });
    createPurchase(db, {
      supplierId: supplier.id,
      accountId: ids.cashAccountId,
      items: [{ productId: product.id, qtyScaled: 100000, unitPriceMinor: 15000 }],
    });

    expect(getProduct(db, product.id)).toMatchObject({
      stockQtyScaled: 200000,
      avgCostMinor: 12500,
    });

    createSale(db, {
      customerId: customer.id,
      accountId: ids.cashAccountId,
      items: [{ kind: "stock", productId: product.id, qtyScaled: 50000, unitPriceMinor: 13000 }],
    });

    expect(listProducts(db).find((item) => item.id === product.id)).toMatchObject({
      stockQtyScaled: 150000,
      avgCostMinor: 12500,
      avgSalePriceMinor: 13000,
    });
  });

  it("rejects a sale price below the current weighted average cost", () => {
    const { ids, supplier, customer, product } = createFixture();
    createPurchase(db, {
      supplierId: supplier.id,
      accountId: ids.cashAccountId,
      items: [{ productId: product.id, qtyScaled: 100000, unitPriceMinor: 10000 }],
    });

    expect(() => createSale(db, {
      customerId: customer.id,
      accountId: ids.cashAccountId,
      items: [{ kind: "stock", productId: product.id, qtyScaled: 10000, unitPriceMinor: 9999 }],
    })).toThrow(/أقل من متوسط تكلفة/);
  });

  it("updates editable product fields", () => {
    const { product } = createFixture();

    const updated = updateProduct(db, product.id, {
      name: "رخام أسود",
      salePriceMinor: 18000,
      minStockQtyScaled: 25000,
      sku: "BLACK-01",
      category: "أسود",
    });

    expect(updated).toMatchObject({
      name: "رخام أسود",
      salePriceMinor: 18000,
      minStockQtyScaled: 25000,
      sku: "BLACK-01",
      category: "أسود",
    });
  });

  it("soft-deletes an unused product", () => {
    const { product } = createFixture();

    deleteProduct(db, product.id);

    expect(getProduct(db, product.id)).toBeUndefined();
    expect(listProducts(db).some((item) => item.id === product.id)).toBe(false);
  });

  it("blocks deleting a product referenced by an invoice and names the invoice", () => {
    const { ids, supplier, product } = createFixture();
    const invoice = createPurchase(db, {
      supplierId: supplier.id,
      accountId: ids.cashAccountId,
      items: [{ productId: product.id, qtyScaled: 10000, unitPriceMinor: 10000 }],
    });

    expect(() => deleteProduct(db, product.id)).toThrow(new RegExp(`فاتورة شراء #${invoice.invoiceNumber}`));
    expect(listProducts(db).some((item) => item.id === product.id)).toBe(true);
  });
});
