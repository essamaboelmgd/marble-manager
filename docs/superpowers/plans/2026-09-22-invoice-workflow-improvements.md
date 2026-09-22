# Invoice Workflow Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make marble purchase/sale workflows dimension-driven and readable, add correct partial payments and invoice details, and add searchable 30-item lists across the requested pages.

**Architecture:** Keep the existing local SQLite ledger authoritative. Add a small pure calculation module, optional width/height fields on invoice inputs and item tables, and one invoice-detail service exposed through the existing Electron IPC bridge. Keep list filtering/pagination local in the renderer because all records are already local and the requested page size is small; share the filtering math through a tested helper and reuse one invoice-details modal for sales and purchases.

**Tech Stack:** React 19, TypeScript, Electron IPC, better-sqlite3, SQLite migrations, Vitest, Vite, existing CSS token system.

## Global Constraints

- New invoice quantities are always square meters: `quantity = width × height`; no thickness field.
- Prices are per square meter and money remains stored in minor units.
- Existing `qtyScaled` domain inputs remain backward compatible for old tests/backups.
- Existing historical invoices are not rewritten; nullable dimensions show as unavailable when absent.
- Pagination shows at most 30 records per page and search resets to page 1.
- Existing backups, auto-backup-on-exit, PIN, activation, cancellation, and financial ledger behavior must remain intact.

---

### Task 1: Add tested area and invoice-money calculations

**Files:**
- Create: `src/domain/calculations.ts`
- Create: `tests/calculations.test.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/services.ts`

**Interfaces:**
- `calculateAreaQtyScaled(width: number, height: number): number` returns `Math.round(width * height * 1000)` and rejects non-positive/non-finite dimensions.
- `calculateLineTotalMinor(qtyScaled: number, unitPriceMinor: number, discountMinor?: number): number` returns the minor-unit line total.
- Purchase and stock-sale lines accept optional `width`/`height`; when present, services calculate quantity from them, otherwise they honor the existing `qtyScaled` field.

- [ ] Write a failing calculation test for `2.5 × 1.2 = 3,000` scaled square meters and a `400 ج.م` price producing `1,200 ج.م`.
- [ ] Run `npx vitest run tests/calculations.test.ts` and confirm it fails because the module is absent.
- [ ] Implement the pure calculation helpers and optional dimension fields.
- [ ] Update `createPurchase` and `createSale` to resolve dimensions server-side and use the shared line-total helper.
- [ ] Run the focused tests and existing domain tests; expect all to pass.

### Task 2: Persist invoice dimensions and expose invoice details

**Files:**
- Modify: `src/domain/database.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/services.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/shared/api.ts`
- Modify: `tests/domain.test.ts`

**Interfaces:**
- Database schema version becomes 2 and adds nullable `width`/`height` to `sales_invoice_items` and `purchase_invoice_items`, with a safe existing-database column check.
- `getInvoiceDetails(db, { invoiceType, invoiceId })` returns party data, invoice totals/status, item dimensions/quantities/prices/totals, and payment history with account names.
- `window.marbleApi.invoices.details(invoiceType, invoiceId)` exposes that query.
- Invoice list records include party phone for searching.

- [ ] Add failing domain tests for a dimension-based invoice retaining dimensions and a partial supplier payment reducing the remaining balance.
- [ ] Run the focused domain tests and confirm the missing columns/detail query behavior fails.
- [ ] Add the migration and detail query without modifying historical totals.
- [ ] Register and expose the `invoices:details` IPC handler.
- [ ] Run domain tests and confirm detail/payment assertions pass.

### Task 3: Add tested local filtering and pagination helpers

**Files:**
- Create: `src/shared/listing.ts`
- Create: `tests/listing.test.ts`

**Interfaces:**
- `normalizeSearch(value: unknown): string` normalizes case and whitespace.
- `filterAndPaginate<T>(items, query, matcher, page, pageSize = 30)` returns filtered items, total count, total pages, and clamped current page.

- [ ] Write failing tests for name/phone/number search and 30-item page boundaries.
- [ ] Run the focused listing tests and confirm failure.
- [ ] Implement the pure helper.
- [ ] Run the focused listing tests and confirm pass.

### Task 4: Redesign purchase and sale forms around labeled dimensions

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Purchase and sale line state stores `width`, `height`, `price`, and derives `quantity`/`total` live.
- New stock lines submit dimensions and unit price per square meter.
- Sale extra line is optional, with a clear name and amount, and stock rows remain valid without it.
- Forms display total, paid now, and remaining and reject invalid local payments before IPC.

- [ ] Add the new line-state and total calculation tests before changing form handlers.
- [ ] Replace compact unlabeled grids with labeled line cells and visible read-only calculated fields.
- [ ] Lock product creation display to `م²` and rename inventory quantity headings from “الرصيد” to “الكمية”.
- [ ] Add separate “إضافة صنف” and optional “إضافة بند إضافي” actions in sales.
- [ ] Run lint and the calculation/domain tests after the form changes.

### Task 5: Add invoice detail modal and partial payments to every invoice list

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- `InvoiceDetailsModal` accepts `invoiceType`, `invoiceId`, `onClose`, and `onChanged`.
- The modal renders all items and payment history, with dimensions when available and a payment form for any remaining balance.
- `InvoiceTable` gets a “التفاصيل” action and can render cancel alongside it.

- [ ] Add the modal loading, item, payment, and refresh behavior using the new API.
- [ ] Add supplier payment handling using the existing `payments.create` API and `invoiceType: "purchase"`.
- [ ] Verify both sale and purchase invoices refresh totals and remaining balances after a payment.

### Task 6: Add search, tabs, and pagination to requested pages

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Customers, products, purchases, sales, appointments, and invoice archive render a shared search toolbar and pagination control.
- Invoice archive uses Sales/Purchases tabs and searches by name, phone, or invoice number.
- Purchase/sale page invoice panels use the same 30-item behavior and details modal.

- [ ] Add search state, page reset, filter predicates, and paged rendering to each requested page.
- [ ] Add the invoice tabs and preserve the selected tab while searching.
- [ ] Add accessible labels, focus styles, disabled previous/next buttons, and empty filtered-state messages.
- [ ] Run lint and all Vitest tests.

### Task 7: Verify integration and build the Windows installer

**Files:**
- Modify: `package.json` and `package-lock.json` only if the version is incremented.
- Generated: `dist/` and `dist/إدارة الرخام Setup <version>.exe` through scripts.

- [ ] Run `npm run lint`, `npm test`, and `npm run build`.
- [ ] Exercise domain integration checks for purchase → stock, sale → stock/receivable, partial payment → remaining/account, and invoice detail retrieval.
- [ ] Run `npm run dist:win` with the Windows native-module guard.
- [ ] Verify the packaged `.node` is PE32+ x64, ASAR contains detail UI/logo and relative assets, and the installer is non-empty.
- [ ] Provide the installer path and exact manual test checklist to the user.
