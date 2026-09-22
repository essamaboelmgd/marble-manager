# Invoice Workflow and Lists Design

## Confirmed business rule

Every new marble stock line uses square meters only. The user enters width and height in meters, the application calculates `quantity = width × height`, and the purchase/sale price is the price for one square meter. Thickness is not collected or used anywhere in this workflow.

## User experience

Purchase and sale rows will show permanent labels for product, width, height, calculated quantity, price per square meter, and line total. The calculated quantity and line total are read-only values so the operator can see exactly what will be posted before saving. A stock-only invoice is valid; an optional single extra line can be added to a sale without affecting stock.

Each invoice form will display total, paid now, and remaining. The same money conversion is used in the UI and domain service: money is stored in minor units and quantity is stored at a 1,000 scale. The domain remains authoritative and rejects a payment larger than the invoice remainder.

## Invoice details and payments

The database will retain nullable width/height columns on invoice item tables. New invoices store the entered dimensions; historical rows remain valid with empty dimensions. A single invoice-details query returns the party, phone, date, line items, dimensions, quantities, prices, totals, payment history, and remaining balance. A modal uses that query for both sales and purchases and includes a partial-payment form with account and method. Existing payment ledger behavior is reused.

## Lists

Customers, products, purchases, sales, appointments, and the invoices archive will use local filtering and 30-item pagination. Search fields will match the useful identifiers for each list: customer/supplier name and phone, product name, appointment customer/phone/invoice, and invoice party name/phone/number. The invoice archive will use separate Sales and Purchases tabs, each with the same search, pagination, details, and payment affordances.

## Compatibility and safety

Existing invoice totals and historical data are not rewritten. Existing product records are not silently reinterpreted; new product creation and new invoice UI use square meters. Existing domain inputs that already provide `qtyScaled` remain accepted so old backups and tests continue to work, while new width/height inputs take precedence and are validated server-side.

## Testing

Tests will cover area and money calculations, dimension-based purchase/sale posting, partial purchase and sale payments, persisted invoice details, and pagination/filter helpers. The final gates are lint, the full Vitest suite, Vite build, Windows packaging, a PE x64 native-module check, and an ASAR check for the UI/logo.
