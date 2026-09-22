import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/domain/database";
import {
  createCustomer,
  createProduct,
  createPurchase,
  createSale,
  createWithdrawal,
  getAccountBalance,
  getCustomerStatement,
  getSetupIds,
  listAppointments,
  listParties,
  listProducts,
  seedDefaults,
} from "../src/domain/services";
import type { Database } from "better-sqlite3";

describe("query and finance service boundaries", () => {
  let db: Database.Database;

  afterEach(() => db?.close());

  it("lists parties/products and exposes a customer statement with appointment details", () => {
    db = createDatabase(":memory:");
    seedDefaults(db);
    const ids = getSetupIds(db);
    const customer = createCustomer(db, { name: "عميل التقرير", phone: "0101" });
    const supplier = createCustomer(db, { name: "مورد التقرير", kind: "supplier" });
    const product = createProduct(db, {
      name: "جرانيت",
      unitId: ids.cubicMeterUnitId,
      salePriceMinor: 300000,
      purchasePriceMinor: 150000,
    });
    createPurchase(db, {
      supplierId: supplier.id,
      accountId: ids.cashAccountId,
      items: [{ productId: product.id, qtyScaled: 3000, unitPriceMinor: 150000 }],
    });
    createSale(db, {
      customerId: customer.id,
      accountId: ids.cashAccountId,
      items: [{ kind: "stock", productId: product.id, qtyScaled: 1000, unitPriceMinor: 300000 }],
      installation: { scheduledAt: "2026-09-25T10:00:00.000Z" },
    });

    expect(listParties(db, "customer")).toHaveLength(1);
    expect(listParties(db, "supplier")).toHaveLength(1);
    expect(listProducts(db)[0].stockQtyScaled).toBe(2000);
    expect(getCustomerStatement(db, customer.id).invoices).toHaveLength(1);
    expect(listAppointments(db)[0].status).toBe("scheduled");
  });

  it("records a withdrawal as an outgoing movement from the selected account", () => {
    db = createDatabase(":memory:");
    seedDefaults(db);
    const ids = getSetupIds(db);

    createWithdrawal(db, {
      accountId: ids.cashAccountId,
      amountMinor: 225000,
      notes: "سحب شخصي",
    });

    expect(getAccountBalance(db, ids.cashAccountId)).toBe(-225000);
  });
});
