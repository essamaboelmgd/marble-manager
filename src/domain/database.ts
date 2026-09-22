import Database from "better-sqlite3";

const CURRENT_SCHEMA_VERSION = 2;

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function createDatabase(filename: string): Database.Database {
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      symbol TEXT NOT NULL,
      quantity_scale INTEGER NOT NULL DEFAULT 1000,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('cash', 'bank')),
      opening_balance_minor INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS parties (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('customer', 'supplier')),
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      unit_id TEXT NOT NULL REFERENCES units(id),
      purchase_price_minor INTEGER NOT NULL DEFAULT 0,
      sale_price_minor INTEGER NOT NULL DEFAULT 0,
      min_stock_qty_scaled INTEGER NOT NULL DEFAULT 0,
      stock_qty_scaled INTEGER NOT NULL DEFAULT 0,
      avg_cost_minor INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS counters (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sales_invoices (
      id TEXT PRIMARY KEY,
      invoice_number INTEGER NOT NULL UNIQUE,
      customer_id TEXT NOT NULL REFERENCES parties(id),
      date TEXT NOT NULL,
      total_minor INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled')),
      cancelled_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales_invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES sales_invoices(id),
      line_kind TEXT NOT NULL CHECK (line_kind IN ('stock', 'extra')),
      product_id TEXT REFERENCES products(id),
      name TEXT NOT NULL,
      qty_scaled INTEGER NOT NULL,
      width REAL,
      height REAL,
      unit_id TEXT REFERENCES units(id),
      unit_price_minor INTEGER NOT NULL,
      discount_minor INTEGER NOT NULL DEFAULT 0,
      total_minor INTEGER NOT NULL,
      cost_minor INTEGER NOT NULL DEFAULT 0,
      cost_total_minor INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id TEXT PRIMARY KEY,
      invoice_number INTEGER NOT NULL UNIQUE,
      supplier_id TEXT NOT NULL REFERENCES parties(id),
      date TEXT NOT NULL,
      total_minor INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled')),
      cancelled_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES purchase_invoices(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      qty_scaled INTEGER NOT NULL,
      width REAL,
      height REAL,
      unit_price_minor INTEGER NOT NULL,
      total_minor INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      invoice_type TEXT NOT NULL CHECK (invoice_type IN ('sale', 'purchase')),
      invoice_id TEXT NOT NULL,
      party_id TEXT NOT NULL REFERENCES parties(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
      method TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id),
      qty_scaled INTEGER NOT NULL,
      unit_cost_minor INTEGER NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
      kind TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      category TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      amount_minor INTEGER NOT NULL,
      date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES parties(id),
      sale_invoice_id TEXT NOT NULL REFERENCES sales_invoices(id),
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_parties_kind_name ON parties(kind, name);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales_invoices(customer_id, date);
    CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchase_invoices(supplier_id, date);
    CREATE INDEX IF NOT EXISTS idx_financial_account_date ON financial_transactions(account_id, date);
    CREATE INDEX IF NOT EXISTS idx_stock_product_date ON stock_movements(product_id, date);
  `);

  ensureColumn(db, "sales_invoice_items", "width", "REAL");
  ensureColumn(db, "sales_invoice_items", "height", "REAL");
  ensureColumn(db, "purchase_invoice_items", "width", "REAL");
  ensureColumn(db, "purchase_invoice_items", "height", "REAL");

  db.prepare(
    "INSERT INTO schema_meta (key, value) VALUES ('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(String(CURRENT_SCHEMA_VERSION));
}
