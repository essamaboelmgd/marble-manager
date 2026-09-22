# Invoice Creation Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move purchase and sales invoice creation into reusable focused popups without changing invoice calculations or persistence.

**Architecture:** Keep each page's existing form state and submit handler in place, but render the form inside a shared `InvoiceComposerModal` controlled by a local `composerOpen` boolean. The modal shell owns only presentation and close behavior; the page owns domain state, validation, saving, and refresh callbacks.

**Tech Stack:** React 19, TypeScript, Vitest, React server rendering for the focused markup test, existing CSS tokens.

## Global Constraints

- No database, IPC, or calculation changes.
- Purchase and sale forms keep their existing field labels, m² calculations, partial payments, and validation.
- The modal closes after a successful save and stays open after an error.
- The history/search/details panels remain visible behind the modal.
- The modal is labelled, keyboard-operable, backdrop-dismissible, and responsive.

---

### Task 1: Add a failing modal-shell render test

**Files:**
- Create: `tests/invoice-composer.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- The test imports named `InvoiceComposerModal` from `src/App.tsx`.
- Props are `{ open: boolean; title: string; onClose: () => void; children: React.ReactNode }`.

- [ ] Write a test that renders the modal open and asserts `role="dialog"`, the title, and child content; render it closed and assert the dialog is absent.
- [ ] Run `npx vitest run tests/invoice-composer.test.tsx` and confirm it fails because the named component is not exported yet.

### Task 2: Implement the reusable modal and wire both pages

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- `InvoiceComposerModal` renders the shared dialog shell and invokes `onClose` from its close button or backdrop click.
- `PurchasesPage` and `SalesPage` add `composerOpen` state and render their existing creation form inside the modal.

- [ ] Add the minimal shared modal shell so the focused test passes.
- [ ] Add `composerOpen` state and a `فاتورة شراء جديدة` trigger to `PurchasesPage`; close the modal after the existing save succeeds.
- [ ] Add `composerOpen` state and a `فاتورة بيع جديدة` trigger to `SalesPage`; close the modal after the existing save succeeds.
- [ ] Keep all existing error paths inside the modal and do not alter their IPC payloads.

### Task 3: Style and verify the modal workflow

**Files:**
- Modify: `src/index.css`

- [ ] Add composer-specific max-width, header, body, and responsive spacing while reusing the existing backdrop/panel styles.
- [ ] Run the focused test and then the complete `npm test` suite.
- [ ] Run `npm run lint` and `npm run build`.
- [ ] Confirm the final diff contains only the modal UI, its test, the focused docs, and no data-layer changes.
