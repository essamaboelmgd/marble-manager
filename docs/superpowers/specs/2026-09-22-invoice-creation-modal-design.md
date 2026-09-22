# Invoice Creation Modal Design

## Goal

Open purchase and sales invoice creation in a focused in-app modal while keeping the invoice history visible behind it.

## Approved behavior

- The purchase page shows a primary `فاتورة شراء جديدة` button instead of an always-visible creation form.
- The sales page shows a primary `فاتورة بيع جديدة` button instead of an always-visible creation form.
- Each button opens one reusable modal shell with the existing form fields, dimension calculations, partial payment fields, and validation unchanged.
- The modal has an accessible dialog label, a close button, backdrop-click close behavior, and a scrollable body on small screens.
- Successful save closes the modal and refreshes the page list/summary. Validation and IPC errors keep the modal open so the user can correct the form.
- The invoice-details modal remains a separate read-only/payment modal and is not conflated with invoice creation.

## Scope and constraints

- No database, domain, IPC, or calculation changes.
- Reuse the existing visual tokens and modal treatment already used by invoice details.
- Preserve the current sale behavior: stock lines work without an extra line, and at most one optional extra line is available.
- Preserve the current purchase behavior: one or more product lines, width × height in m², and partial supplier payments.
- Keep the layout keyboard-accessible with a real dialog role, labelled heading, and close control.

## Verification

- A focused render test proves the reusable creation modal exposes the dialog title and form content when open and renders nothing when closed.
- `npm run lint`, `npm test`, and `npm run build` must pass.
