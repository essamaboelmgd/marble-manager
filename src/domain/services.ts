import crypto from "node:crypto";
import Database from "better-sqlite3";
import type {
  ExpenseInput,
  InvoiceDetail,
  InvoiceItemDetail,
  InvoicePaymentDetail,
  InvoiceResult,
  InvoiceType,
  PartyInput,
  PartyRecord,
  PaymentInput,
  ProductInput,
  ProductRecord,
  PurchaseInput,
  SaleInput,
  SetupIds,
  WithdrawalInput,
} from "./types";
import { createDatabase } from "./database";
import { calculateLineTotalMinor, resolveQuantityScaled } from "./calculations";

export { createDatabase } from "./database";

const QUANTITY_SCALE = 1000;

function id(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function requirePositive(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} يجب أن يكون رقمًا صحيحًا أكبر من صفر`);
  }
}

function partyExists(db: Database.Database, partyId: string, kind: "customer" | "supplier"): void {
  const party = db.prepare("SELECT id FROM parties WHERE id = ? AND kind = ? AND is_deleted = 0").get(partyId, kind);
  if (!party) throw new Error(`لم يتم العثور على ${kind === "customer" ? "العميل" : "المورد"}`);
}

function accountExists(db: Database.Database, accountId: string): void {
  if (!db.prepare("SELECT id FROM accounts WHERE id = ?").get(accountId)) {
    throw new Error("الحساب المالي غير موجود");
  }
}

function productRow(db: Database.Database, productId: string): ProductRecord & { unitId: string } {
  const row = db.prepare(`
    SELECT id, name, sku, category, unit_id as unitId,
      purchase_price_minor as purchasePriceMinor,
      sale_price_minor as salePriceMinor,
      min_stock_qty_scaled as minStockQtyScaled,
      stock_qty_scaled as stockQtyScaled,
      avg_cost_minor as avgCostMinor
    FROM products WHERE id = ? AND is_deleted = 0
  `).get(productId) as (ProductRecord & { unitId: string }) | undefined;
  if (!row) throw new Error("الصنف غير موجود");
  return row;
}

function nextNumber(db: Database.Database, name: string): number {
  db.prepare("INSERT INTO counters (name, value) VALUES (?, 0) ON CONFLICT(name) DO NOTHING").run(name);
  const row = db.prepare("UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value").get(name) as { value: number };
  return row.value;
}

function addFinancialTransaction(
  db: Database.Database,
  input: {
    accountId: string;
    direction: "in" | "out";
    amountMinor: number;
    kind: string;
    sourceType: string;
    sourceId: string;
    description?: string;
    date: string;
  },
): string {
  const transactionId = id();
  db.prepare(`
    INSERT INTO financial_transactions
      (id, account_id, direction, amount_minor, kind, source_type, source_id, description, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    transactionId,
    input.accountId,
    input.direction,
    input.amountMinor,
    input.kind,
    input.sourceType,
    input.sourceId,
    input.description ?? "",
    input.date,
  );
  return transactionId;
}

function addAudit(db: Database.Database, action: string, entityType: string, entityId: string, details: unknown): void {
  db.prepare(
    "INSERT INTO audit_log (id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id(), action, entityType, entityId, JSON.stringify(details), now());
}

function recalculateProductCost(db: Database.Database, productId: string): void {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(qty_scaled), 0) as stockQtyScaled,
      COALESCE(SUM(qty_scaled * unit_cost_minor), 0) as stockValueScaled
    FROM stock_movements WHERE product_id = ?
  `).get(productId) as { stockQtyScaled: number; stockValueScaled: number };
  const avgCostMinor = totals.stockQtyScaled > 0
    ? Math.round(totals.stockValueScaled / totals.stockQtyScaled)
    : 0;
  db.prepare(
    "UPDATE products SET stock_qty_scaled = ?, avg_cost_minor = ?, updated_at = ? WHERE id = ?",
  ).run(totals.stockQtyScaled, avgCostMinor, now(), productId);
}

export function seedDefaults(db: Database.Database): void {
  const timestamp = now();
  const units = [
    ["unit-cubic-meter", "متر مكعب", "م³"],
    ["unit-square-meter", "متر مربع", "م²"],
    ["unit-piece", "قطعة", "قطعة"],
    ["unit-generic", "وحدة", "وحدة"],
  ];
  const addUnit = db.prepare(
    "INSERT OR IGNORE INTO units (id, name, symbol, quantity_scale, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const addWarehouse = db.prepare(
    "INSERT OR IGNORE INTO warehouses (id, name, created_at) VALUES (?, ?, ?)",
  );
  const addAccount = db.prepare(
    "INSERT OR IGNORE INTO accounts (id, name, type, opening_balance_minor, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const addSetting = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  );

  const seed = db.transaction(() => {
    for (const [unitId, name, symbol] of units) addUnit.run(unitId, name, symbol, QUANTITY_SCALE, timestamp);
    addWarehouse.run("warehouse-main", "المخزن الرئيسي", timestamp);
    addAccount.run("account-cash-main", "الخزينة الرئيسية", "cash", 0, timestamp);
    addAccount.run("account-bank-main", "البنك الرئيسي", "bank", 0, timestamp);
    addSetting.run("language", "ar");
    addSetting.run("direction", "rtl");
    addSetting.run("currency", "ج.م");
    addSetting.run("businessName", "إدارة الرخام");
    addSetting.run("backupDirectory", "");
  });
  seed();
}

export function getSetupIds(db: Database.Database): SetupIds {
  return {
    cubicMeterUnitId: "unit-cubic-meter",
    squareMeterUnitId: "unit-square-meter",
    pieceUnitId: "unit-piece",
    genericUnitId: "unit-generic",
    warehouseId: "warehouse-main",
    cashAccountId: "account-cash-main",
    bankAccountId: "account-bank-main",
  };
}

export function createCustomer(db: Database.Database, input: PartyInput): PartyRecord {
  if (!input.name.trim()) throw new Error("الاسم مطلوب");
  const record: PartyRecord = {
    id: id(),
    kind: input.kind ?? "customer",
    name: input.name.trim(),
    phone: input.phone?.trim() ?? "",
    address: input.address?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
    createdAt: now(),
  };
  db.prepare(`
    INSERT INTO parties (id, kind, name, phone, address, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(record.id, record.kind, record.name, record.phone, record.address, record.notes, record.createdAt, record.createdAt);
  return record;
}

export function createProduct(db: Database.Database, input: ProductInput): ProductRecord {
  if (!input.name.trim()) throw new Error("اسم الصنف مطلوب");
  if (!db.prepare("SELECT id FROM units WHERE id = ?").get(input.unitId)) throw new Error("وحدة الصنف غير موجودة");
  const record: ProductRecord = {
    id: id(),
    name: input.name.trim(),
    unitId: input.unitId,
    purchasePriceMinor: input.purchasePriceMinor ?? 0,
    salePriceMinor: input.salePriceMinor ?? 0,
    minStockQtyScaled: input.minStockQtyScaled ?? 0,
    stockQtyScaled: 0,
    avgCostMinor: 0,
    sku: input.sku?.trim() ?? "",
    category: input.category?.trim() ?? "",
  };
  db.prepare(`
    INSERT INTO products
      (id, name, sku, category, unit_id, purchase_price_minor, sale_price_minor, min_stock_qty_scaled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.name,
    record.sku,
    record.category,
    record.unitId,
    record.purchasePriceMinor,
    record.salePriceMinor,
    record.minStockQtyScaled,
    now(),
    now(),
  );
  return record;
}

export function getProduct(db: Database.Database, productId: string): ProductRecord | undefined {
  return db.prepare(`
    SELECT id, name, sku, category, unit_id as unitId,
      purchase_price_minor as purchasePriceMinor,
      sale_price_minor as salePriceMinor,
      min_stock_qty_scaled as minStockQtyScaled,
      stock_qty_scaled as stockQtyScaled,
      avg_cost_minor as avgCostMinor
    FROM products WHERE id = ?
  `).get(productId) as ProductRecord | undefined;
}

export function createPurchase(db: Database.Database, input: PurchaseInput): InvoiceResult {
  partyExists(db, input.supplierId, "supplier");
  accountExists(db, input.accountId);
  if (!input.items.length) throw new Error("أضف صنفًا واحدًا على الأقل");
  const paidMinor = input.paidMinor ?? 0;
  if (paidMinor < 0) throw new Error("المدفوع لا يمكن أن يكون سالبًا");
  const date = input.date ?? now();

  return db.transaction(() => {
    const preparedItems = input.items.map((item) => {
      const qtyScaled = resolveQuantityScaled(item);
      if (!Number.isInteger(item.unitPriceMinor) || item.unitPriceMinor < 0) throw new Error("سعر الشراء غير صحيح");
      const product = productRow(db, item.productId);
      return {
        ...item,
        qtyScaled,
        width: item.width ?? null,
        height: item.height ?? null,
        product,
        totalMinor: calculateLineTotalMinor(qtyScaled, item.unitPriceMinor),
      };
    });
    const totalMinor = preparedItems.reduce((sum, item) => sum + item.totalMinor, 0);
    if (paidMinor > totalMinor) throw new Error("المدفوع أكبر من إجمالي الفاتورة");
    const invoiceId = id();
    const invoiceNumber = nextNumber(db, "purchase_invoice");
    db.prepare(`
      INSERT INTO purchase_invoices (id, invoice_number, supplier_id, date, total_minor, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(invoiceId, invoiceNumber, input.supplierId, date, totalMinor, input.notes ?? "", now());

    for (const item of preparedItems) {
      db.prepare(`
        INSERT INTO purchase_invoice_items (id, invoice_id, product_id, qty_scaled, width, height, unit_price_minor, total_minor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id(), invoiceId, item.productId, item.qtyScaled, item.width, item.height, item.unitPriceMinor, item.totalMinor);
      db.prepare(`
        INSERT INTO stock_movements (id, product_id, qty_scaled, unit_cost_minor, source_type, source_id, date)
        VALUES (?, ?, ?, ?, 'purchase', ?, ?)
      `).run(id(), item.productId, item.qtyScaled, item.unitPriceMinor, invoiceId, date);
      recalculateProductCost(db, item.productId);
    }

    if (paidMinor > 0) {
      const paymentId = id();
      db.prepare(`
        INSERT INTO payments (id, invoice_type, invoice_id, party_id, account_id, amount_minor, method, date, notes)
        VALUES (?, 'purchase', ?, ?, ?, ?, ?, ?, ?)
      `).run(paymentId, invoiceId, input.supplierId, input.accountId, paidMinor, input.method ?? "cash", date, "");
      addFinancialTransaction(db, {
        accountId: input.accountId,
        direction: "out",
        amountMinor: paidMinor,
        kind: "purchase_payment",
        sourceType: "purchase_invoice",
        sourceId: invoiceId,
        description: `دفعة فاتورة شراء #${invoiceNumber}`,
        date,
      });
    }
    addAudit(db, "create", "purchase_invoice", invoiceId, { invoiceNumber });
    return { id: invoiceId, invoiceNumber, totalMinor, paidMinor };
  })();
}

export function createSale(db: Database.Database, input: SaleInput): InvoiceResult {
  partyExists(db, input.customerId, "customer");
  accountExists(db, input.accountId);
  if (!input.items.length) throw new Error("أضف بندًا واحدًا على الأقل");
  const paidMinor = input.paidMinor ?? 0;
  if (paidMinor < 0) throw new Error("المدفوع لا يمكن أن يكون سالبًا");
  const date = input.date ?? now();

  return db.transaction(() => {
    const preparedItems = input.items.map((item) => {
      const qtyScaled = item.kind === "stock" ? resolveQuantityScaled(item) : item.qtyScaled ?? QUANTITY_SCALE;
      requirePositive(qtyScaled, "الكمية");
      if (!Number.isInteger(item.unitPriceMinor) || item.unitPriceMinor < 0) throw new Error("سعر البيع غير صحيح");
      const discountMinor = item.discountMinor ?? 0;
      if (discountMinor < 0) throw new Error("الخصم لا يمكن أن يكون سالبًا");
      if (item.kind === "extra") {
        if (!item.name.trim()) throw new Error("اسم البند الإضافي مطلوب");
        return {
          kind: item.kind,
          name: item.name.trim(),
          width: null,
          height: null,
          qtyScaled,
          unitId: null,
          productId: null,
          unitPriceMinor: item.unitPriceMinor,
          discountMinor,
          totalMinor: calculateLineTotalMinor(qtyScaled, item.unitPriceMinor, discountMinor),
          costMinor: 0,
          costTotalMinor: 0,
        };
      }
      const product = productRow(db, item.productId);
      if (product.stockQtyScaled < qtyScaled) throw new Error(`المخزون غير كاف للصنف: ${product.name}`);
      return {
        kind: item.kind,
        name: product.name,
        width: item.width ?? null,
        height: item.height ?? null,
        qtyScaled,
        unitId: product.unitId,
        productId: product.id,
        unitPriceMinor: item.unitPriceMinor,
        discountMinor,
        totalMinor: calculateLineTotalMinor(qtyScaled, item.unitPriceMinor, discountMinor),
        costMinor: product.avgCostMinor,
        costTotalMinor: Math.round((qtyScaled * product.avgCostMinor) / QUANTITY_SCALE),
      };
    });
    const totalMinor = preparedItems.reduce((sum, item) => sum + item.totalMinor, 0);
    if (paidMinor > totalMinor) throw new Error("المدفوع أكبر من إجمالي الفاتورة");
    const invoiceId = id();
    const invoiceNumber = nextNumber(db, "sales_invoice");
    db.prepare(`
      INSERT INTO sales_invoices (id, invoice_number, customer_id, date, total_minor, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(invoiceId, invoiceNumber, input.customerId, date, totalMinor, input.notes ?? "", now());

    for (const item of preparedItems) {
      db.prepare(`
        INSERT INTO sales_invoice_items
          (id, invoice_id, line_kind, product_id, name, qty_scaled, width, height, unit_id, unit_price_minor, discount_minor, total_minor, cost_minor, cost_total_minor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id(), invoiceId, item.kind, item.productId, item.name, item.qtyScaled, item.width, item.height, item.unitId,
        item.unitPriceMinor, item.discountMinor, item.totalMinor, item.costMinor, item.costTotalMinor,
      );
      if (item.kind === "stock" && item.productId) {
        db.prepare(`
          INSERT INTO stock_movements (id, product_id, qty_scaled, unit_cost_minor, source_type, source_id, date)
          VALUES (?, ?, ?, ?, 'sale', ?, ?)
        `).run(id(), item.productId, -item.qtyScaled, item.costMinor, invoiceId, date);
        recalculateProductCost(db, item.productId);
      }
    }

    if (paidMinor > 0) {
      db.prepare(`
        INSERT INTO payments (id, invoice_type, invoice_id, party_id, account_id, amount_minor, method, date, notes)
        VALUES (?, 'sale', ?, ?, ?, ?, ?, ?, ?)
      `).run(id(), invoiceId, input.customerId, input.accountId, paidMinor, input.method ?? "cash", date, "");
      addFinancialTransaction(db, {
        accountId: input.accountId,
        direction: "in",
        amountMinor: paidMinor,
        kind: "sale_payment",
        sourceType: "sales_invoice",
        sourceId: invoiceId,
        description: `تحصيل فاتورة مبيعات #${invoiceNumber}`,
        date,
      });
    }
    if (input.installation) {
      db.prepare(`
        INSERT INTO appointments (id, customer_id, sale_invoice_id, scheduled_at, status, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id(), input.customerId, invoiceId, input.installation.scheduledAt, input.installation.status ?? "scheduled", input.installation.notes ?? "");
    }
    addAudit(db, "create", "sales_invoice", invoiceId, { invoiceNumber });
    return { id: invoiceId, invoiceNumber, totalMinor, paidMinor };
  })();
}

export function recordPayment(db: Database.Database, input: PaymentInput): void {
  accountExists(db, input.accountId);
  requirePositive(input.amountMinor, "قيمة الدفعة");
  const date = input.date ?? now();
  db.transaction(() => {
    const table = input.invoiceType === "sale" ? "sales_invoices" : "purchase_invoices";
    const partyColumn = input.invoiceType === "sale" ? "customer_id" : "supplier_id";
    const invoice = db.prepare(`SELECT id, ${partyColumn} as partyId, total_minor as totalMinor, status FROM ${table} WHERE id = ?`).get(input.invoiceId) as {
      id: string; partyId: string; totalMinor: number; status: string;
    } | undefined;
    if (!invoice || invoice.status === "cancelled") throw new Error("الفاتورة غير موجودة أو ملغاة");
    const paid = db.prepare("SELECT COALESCE(SUM(amount_minor), 0) as amount FROM payments WHERE invoice_type = ? AND invoice_id = ?").get(input.invoiceType, input.invoiceId) as { amount: number };
    if (paid.amount + input.amountMinor > invoice.totalMinor) throw new Error("الدفعة أكبر من المتبقي");
    db.prepare(`
      INSERT INTO payments (id, invoice_type, invoice_id, party_id, account_id, amount_minor, method, date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id(), input.invoiceType, input.invoiceId, invoice.partyId, input.accountId, input.amountMinor, input.method, date, input.notes ?? "");
    addFinancialTransaction(db, {
      accountId: input.accountId,
      direction: input.invoiceType === "sale" ? "in" : "out",
      amountMinor: input.amountMinor,
      kind: input.invoiceType === "sale" ? "sale_payment" : "purchase_payment",
      sourceType: input.invoiceType === "sale" ? "sales_invoice" : "purchase_invoice",
      sourceId: input.invoiceId,
      description: "دفعة لاحقة",
      date,
    });
    addAudit(db, "payment", "invoice", input.invoiceId, { amountMinor: input.amountMinor });
  })();
}

export function createExpense(db: Database.Database, input: ExpenseInput): void {
  accountExists(db, input.accountId);
  requirePositive(input.amountMinor, "قيمة المصروف");
  const expenseId = id();
  const date = input.date ?? now();
  db.transaction(() => {
    db.prepare(
      "INSERT INTO expenses (id, account_id, category, amount_minor, date, notes) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(expenseId, input.accountId, input.category.trim(), input.amountMinor, date, input.notes ?? "");
    addFinancialTransaction(db, {
      accountId: input.accountId,
      direction: "out",
      amountMinor: input.amountMinor,
      kind: "expense",
      sourceType: "expense",
      sourceId: expenseId,
      description: input.category,
      date,
    });
    addAudit(db, "create", "expense", expenseId, { amountMinor: input.amountMinor });
  })();
}

export function createWithdrawal(db: Database.Database, input: WithdrawalInput): void {
  accountExists(db, input.accountId);
  requirePositive(input.amountMinor, "قيمة المسحوب");
  const withdrawalId = id();
  const date = input.date ?? now();
  db.transaction(() => {
    db.prepare(
      "INSERT INTO withdrawals (id, account_id, amount_minor, date, notes) VALUES (?, ?, ?, ?, ?)",
    ).run(withdrawalId, input.accountId, input.amountMinor, date, input.notes ?? "");
    addFinancialTransaction(db, {
      accountId: input.accountId,
      direction: "out",
      amountMinor: input.amountMinor,
      kind: "withdrawal",
      sourceType: "withdrawal",
      sourceId: withdrawalId,
      description: "مسحوب شخصي",
      date,
    });
    addAudit(db, "create", "withdrawal", withdrawalId, { amountMinor: input.amountMinor });
  })();
}

export function listParties(db: Database.Database, kind?: "customer" | "supplier"): PartyRecord[] {
  const rows = (kind
    ? db.prepare(`SELECT id, kind, name, phone, address, notes, created_at as createdAt FROM parties WHERE kind = ? AND is_deleted = 0 ORDER BY name`).all(kind)
    : db.prepare("SELECT id, kind, name, phone, address, notes, created_at as createdAt FROM parties WHERE is_deleted = 0 ORDER BY name").all()) as PartyRecord[];
  return rows;
}

export function listProducts(db: Database.Database): ProductRecord[] {
  return db.prepare(`
    SELECT id, name, sku, category, unit_id as unitId,
      purchase_price_minor as purchasePriceMinor,
      sale_price_minor as salePriceMinor,
      min_stock_qty_scaled as minStockQtyScaled,
      stock_qty_scaled as stockQtyScaled,
      avg_cost_minor as avgCostMinor
    FROM products WHERE is_deleted = 0 ORDER BY name
  `).all() as ProductRecord[];
}

export function listUnits(db: Database.Database): Array<{ id: string; name: string; symbol: string; quantityScale: number }> {
  return db.prepare("SELECT id, name, symbol, quantity_scale as quantityScale FROM units ORDER BY name").all() as Array<{ id: string; name: string; symbol: string; quantityScale: number }>;
}

export function listAppointments(db: Database.Database): Array<{
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  saleInvoiceId: string;
  invoiceNumber: number;
  scheduledAt: string;
  status: string;
  notes: string;
}> {
  return db.prepare(`
    SELECT a.id, a.customer_id as customerId, p.name as customerName, p.phone as customerPhone,
      a.sale_invoice_id as saleInvoiceId, s.invoice_number as invoiceNumber,
      a.scheduled_at as scheduledAt, a.status, a.notes
    FROM appointments a
    JOIN parties p ON p.id = a.customer_id
    JOIN sales_invoices s ON s.id = a.sale_invoice_id
    WHERE s.status = 'open'
    ORDER BY a.scheduled_at
  `).all() as Array<{
    id: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    saleInvoiceId: string;
    invoiceNumber: number;
    scheduledAt: string;
    status: string;
    notes: string;
  }>;
}

export function getCustomerStatement(db: Database.Database, customerId: string): {
  party: PartyRecord;
  balanceMinor: number;
  invoices: Array<{ id: string; invoiceNumber: number; date: string; totalMinor: number; paidMinor: number; remainingMinor: number; status: string }>;
} {
  partyExists(db, customerId, "customer");
  const party = db.prepare("SELECT id, kind, name, phone, address, notes, created_at as createdAt FROM parties WHERE id = ?").get(customerId) as PartyRecord;
  const invoices = db.prepare(`
    SELECT s.id, s.invoice_number as invoiceNumber, s.date, s.total_minor as totalMinor,
      COALESCE(SUM(pay.amount_minor), 0) as paidMinor,
      s.total_minor - COALESCE(SUM(pay.amount_minor), 0) as remainingMinor,
      s.status
    FROM sales_invoices s
    LEFT JOIN payments pay ON pay.invoice_type = 'sale' AND pay.invoice_id = s.id
    WHERE s.customer_id = ?
    GROUP BY s.id
    ORDER BY s.date DESC
  `).all(customerId) as Array<{ id: string; invoiceNumber: number; date: string; totalMinor: number; paidMinor: number; remainingMinor: number; status: string }>;
  return { party, balanceMinor: getCustomerBalance(db, customerId, "customer"), invoices };
}

export function listSalesInvoices(db: Database.Database): Array<{
  id: string;
  invoiceNumber: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  date: string;
  totalMinor: number;
  paidMinor: number;
  remainingMinor: number;
  status: string;
}> {
  return db.prepare(`
    SELECT s.id, s.invoice_number as invoiceNumber, s.customer_id as customerId,
      p.name as customerName, p.phone as customerPhone, s.date, s.total_minor as totalMinor,
      COALESCE(SUM(pay.amount_minor), 0) as paidMinor,
      s.total_minor - COALESCE(SUM(pay.amount_minor), 0) as remainingMinor,
      s.status
    FROM sales_invoices s
    JOIN parties p ON p.id = s.customer_id
    LEFT JOIN payments pay ON pay.invoice_type = 'sale' AND pay.invoice_id = s.id
    GROUP BY s.id
    ORDER BY s.date DESC
  `).all() as Array<{
    id: string;
    invoiceNumber: number;
    customerId: string;
    customerName: string;
    customerPhone: string;
    date: string;
    totalMinor: number;
    paidMinor: number;
    remainingMinor: number;
    status: string;
  }>;
}

export function listPurchaseInvoices(db: Database.Database): Array<{
  id: string;
  invoiceNumber: number;
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  date: string;
  totalMinor: number;
  paidMinor: number;
  remainingMinor: number;
  status: string;
}> {
  return db.prepare(`
    SELECT s.id, s.invoice_number as invoiceNumber, s.supplier_id as supplierId,
      p.name as supplierName, p.phone as supplierPhone, s.date, s.total_minor as totalMinor,
      COALESCE(SUM(pay.amount_minor), 0) as paidMinor,
      s.total_minor - COALESCE(SUM(pay.amount_minor), 0) as remainingMinor,
      s.status
    FROM purchase_invoices s
    JOIN parties p ON p.id = s.supplier_id
    LEFT JOIN payments pay ON pay.invoice_type = 'purchase' AND pay.invoice_id = s.id
    GROUP BY s.id
    ORDER BY s.date DESC
  `).all() as Array<{
    id: string;
    invoiceNumber: number;
    supplierId: string;
    supplierName: string;
    supplierPhone: string;
    date: string;
    totalMinor: number;
    paidMinor: number;
    remainingMinor: number;
    status: string;
  }>;
}

export function getInvoiceDetails(db: Database.Database, input: { invoiceType: InvoiceType; invoiceId: string }): InvoiceDetail {
  const invoiceTable = input.invoiceType === "sale" ? "sales_invoices" : "purchase_invoices";
  const partyColumn = input.invoiceType === "sale" ? "customer_id" : "supplier_id";
  const row = db.prepare(`
    SELECT i.id, i.invoice_number as invoiceNumber, i.${partyColumn} as partyId,
      p.name as partyName, p.phone as partyPhone, p.address as partyAddress,
      i.date, i.total_minor as totalMinor, i.status, i.notes
    FROM ${invoiceTable} i
    JOIN parties p ON p.id = i.${partyColumn}
    WHERE i.id = ?
  `).get(input.invoiceId) as {
    id: string;
    invoiceNumber: number;
    partyId: string;
    partyName: string;
    partyPhone: string;
    partyAddress: string;
    date: string;
    totalMinor: number;
    status: string;
    notes: string;
  } | undefined;
  if (!row) throw new Error("الفاتورة غير موجودة");

  const items = (input.invoiceType === "sale"
    ? db.prepare(`
        SELECT i.id, i.line_kind as kind, i.product_id as productId, i.name,
          i.width, i.height, i.qty_scaled as qtyScaled,
          COALESCE(u.symbol, 'م²') as unitSymbol,
          i.unit_price_minor as unitPriceMinor, i.discount_minor as discountMinor,
          i.total_minor as totalMinor
        FROM sales_invoice_items i
        LEFT JOIN units u ON u.id = i.unit_id
        WHERE i.invoice_id = ? ORDER BY i.rowid
      `).all(input.invoiceId)
    : db.prepare(`
        SELECT i.id, 'stock' as kind, i.product_id as productId, p.name,
          i.width, i.height, i.qty_scaled as qtyScaled,
          COALESCE(u.symbol, 'م²') as unitSymbol,
          i.unit_price_minor as unitPriceMinor, 0 as discountMinor,
          i.total_minor as totalMinor
        FROM purchase_invoice_items i
        JOIN products p ON p.id = i.product_id
        LEFT JOIN units u ON u.id = p.unit_id
        WHERE i.invoice_id = ? ORDER BY i.rowid
      `).all(input.invoiceId)) as InvoiceItemDetail[];

  const payments = db.prepare(`
    SELECT pay.id, pay.amount_minor as amountMinor, pay.method, pay.date,
      a.name as accountName, pay.notes
    FROM payments pay
    JOIN accounts a ON a.id = pay.account_id
    WHERE pay.invoice_type = ? AND pay.invoice_id = ?
    ORDER BY pay.date, pay.rowid
  `).all(input.invoiceType, input.invoiceId) as InvoicePaymentDetail[];
  const paidMinor = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);

  return {
    ...row,
    invoiceType: input.invoiceType,
    paidMinor,
    remainingMinor: row.totalMinor - paidMinor,
    items,
    payments,
  };
}

export function listFinancialTransactions(db: Database.Database): Array<{
  id: string;
  accountId: string;
  accountName: string;
  direction: "in" | "out";
  amountMinor: number;
  kind: string;
  description: string;
  date: string;
}> {
  return db.prepare(`
    SELECT f.id, f.account_id as accountId, a.name as accountName,
      f.direction, f.amount_minor as amountMinor, f.kind,
      f.description, f.date
    FROM financial_transactions f
    JOIN accounts a ON a.id = f.account_id
    ORDER BY f.date DESC
  `).all() as Array<{
    id: string;
    accountId: string;
    accountName: string;
    direction: "in" | "out";
    amountMinor: number;
    kind: string;
    description: string;
    date: string;
  }>;
}

export function listAccounts(db: Database.Database): Array<{ id: string; name: string; type: "cash" | "bank"; balanceMinor: number }> {
  const accounts = db.prepare("SELECT id, name, type FROM accounts ORDER BY type, name").all() as Array<{ id: string; name: string; type: "cash" | "bank" }>;
  return accounts.map((account) => ({ ...account, balanceMinor: getAccountBalance(db, account.id) }));
}

export function updateAppointmentStatus(db: Database.Database, appointmentId: string, status: string): void {
  const result = db.prepare("UPDATE appointments SET status = ? WHERE id = ?").run(status, appointmentId);
  if (result.changes === 0) throw new Error("الموعد غير موجود");
  addAudit(db, "update", "appointment", appointmentId, { status });
}

export function getSettings(db: Database.Database): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function getCustomerBalance(db: Database.Database, partyId: string, kind: "customer" | "supplier"): number {
  partyExists(db, partyId, kind);
  const invoiceTable = kind === "customer" ? "sales_invoices" : "purchase_invoices";
  const invoiceType: InvoiceType = kind === "customer" ? "sale" : "purchase";
  const invoiceColumn = kind === "customer" ? "customer_id" : "supplier_id";
  const total = db.prepare(`SELECT COALESCE(SUM(total_minor), 0) as total FROM ${invoiceTable} WHERE ${invoiceColumn} = ? AND status = 'open'`).get(partyId) as { total: number };
  const paid = db.prepare("SELECT COALESCE(SUM(amount_minor), 0) as total FROM payments WHERE invoice_type = ? AND party_id = ? AND invoice_id IN (SELECT id FROM " + invoiceTable + " WHERE status = 'open')").get(invoiceType, partyId) as { total: number };
  return total.total - paid.total;
}

export function getAccountBalance(db: Database.Database, accountId: string): number {
  const account = db.prepare("SELECT opening_balance_minor as opening FROM accounts WHERE id = ?").get(accountId) as { opening: number } | undefined;
  if (!account) throw new Error("الحساب المالي غير موجود");
  const total = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_minor ELSE -amount_minor END), 0) as movement
    FROM financial_transactions WHERE account_id = ?
  `).get(accountId) as { movement: number };
  return account.opening + total.movement;
}

export function cancelInvoice(db: Database.Database, input: { invoiceType: InvoiceType; invoiceId: string }): void {
  const table = input.invoiceType === "sale" ? "sales_invoices" : "purchase_invoices";
  db.transaction(() => {
    const invoice = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(input.invoiceId) as Record<string, unknown> | undefined;
    if (!invoice) throw new Error("الفاتورة غير موجودة");
    if (invoice.status === "cancelled") throw new Error("الفاتورة ملغاة بالفعل");
    const items = db.prepare(input.invoiceType === "sale"
      ? "SELECT product_id as productId, qty_scaled as qtyScaled, cost_minor as unitCostMinor, line_kind as lineKind FROM sales_invoice_items WHERE invoice_id = ?"
      : "SELECT product_id as productId, qty_scaled as qtyScaled, unit_price_minor as unitCostMinor FROM purchase_invoice_items WHERE invoice_id = ?").all(input.invoiceId) as Array<{ productId: string | null; qtyScaled: number; unitCostMinor: number; lineKind?: string }>;
    for (const item of items) {
      if (!item.productId || item.lineKind === "extra") continue;
      const reverseQty = input.invoiceType === "sale" ? item.qtyScaled : -item.qtyScaled;
      db.prepare(`
        INSERT INTO stock_movements (id, product_id, qty_scaled, unit_cost_minor, source_type, source_id, date)
        VALUES (?, ?, ?, ?, 'cancellation', ?, ?)
      `).run(id(), item.productId, reverseQty, item.unitCostMinor, input.invoiceId, now());
      recalculateProductCost(db, item.productId);
    }
    const payments = db.prepare("SELECT account_id as accountId, amount_minor as amountMinor FROM payments WHERE invoice_type = ? AND invoice_id = ?").all(input.invoiceType, input.invoiceId) as Array<{ accountId: string; amountMinor: number }>;
    for (const payment of payments) {
      addFinancialTransaction(db, {
        accountId: payment.accountId,
        direction: input.invoiceType === "sale" ? "out" : "in",
        amountMinor: payment.amountMinor,
        kind: "invoice_cancellation",
        sourceType: input.invoiceType === "sale" ? "sales_invoice" : "purchase_invoice",
        sourceId: input.invoiceId,
        description: "عكس دفعة فاتورة ملغاة",
        date: now(),
      });
    }
    db.prepare(`UPDATE ${table} SET status = 'cancelled', cancelled_at = ? WHERE id = ?`).run(now(), input.invoiceId);
    addAudit(db, "cancel", input.invoiceType === "sale" ? "sales_invoice" : "purchase_invoice", input.invoiceId, {});
  })();
}

export function getDashboardSummary(db: Database.Database): {
  salesTotalMinor: number;
  purchasesTotalMinor: number;
  receivablesMinor: number;
  payablesMinor: number;
  cashBalanceMinor: number;
  bankBalanceMinor: number;
} {
  const sales = db.prepare("SELECT COALESCE(SUM(total_minor), 0) as total FROM sales_invoices WHERE status = 'open'").get() as { total: number };
  const purchases = db.prepare("SELECT COALESCE(SUM(total_minor), 0) as total FROM purchase_invoices WHERE status = 'open'").get() as { total: number };
  const parties = db.prepare("SELECT id, kind FROM parties WHERE is_deleted = 0").all() as Array<{ id: string; kind: "customer" | "supplier" }>;
  let receivablesMinor = 0;
  let payablesMinor = 0;
  for (const party of parties) {
    const balance = getCustomerBalance(db, party.id, party.kind);
    if (party.kind === "customer") receivablesMinor += balance;
    else payablesMinor += balance;
  }
  return {
    salesTotalMinor: sales.total,
    purchasesTotalMinor: purchases.total,
    receivablesMinor,
    payablesMinor,
    cashBalanceMinor: getAccountBalance(db, "account-cash-main"),
    bankBalanceMinor: getAccountBalance(db, "account-bank-main"),
  };
}
