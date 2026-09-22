# Marble Manager Activation and App Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-run offline activation gate using the exact code `ShiFt_2026#`, keep the program unlocked after successful activation, and use the supplied public logo as the Electron/Windows application icon and in the activation screen.

**Architecture:** The Electron main process will verify a SHA-256 digest of the activation code and expose only `status` and `activate` IPC methods to the renderer. Successful activation will be stored as a generic settings value in the existing local SQLite database, so existing installations and backups remain compatible without a schema migration. Electron will use the existing 500×500 transparent PNG from `public` for the window icon and electron-builder Windows icon; the React shell and activation page will reference the same Vite-relative public asset.

**Tech Stack:** Electron 38, React 19, TypeScript, Vite, better-sqlite3, Vitest, electron-builder NSIS.

## Global Constraints

- The application remains offline/local-first; no server, telemetry, or network activation is added.
- The activation code is exactly `ShiFt_2026#` and is accepted once per local data directory.
- Existing optional numeric PIN behavior remains unchanged.
- Existing database data, automatic backups, manual backups, and restore behavior remain compatible.
- The supplied asset is `public/logo-small-light-removebg-preview.png` and must be used without replacing it.

---

### Task 1: Add a tested activation-code verifier

**Files:**
- Create: `src/domain/activation.ts`
- Create: `tests/activation.test.ts`

**Interfaces:**
- Produces `isActivationCodeValid(code: string): boolean` for the Electron main process and tests.
- Keeps the expected code out of the renderer and compares SHA-256 digests with a timing-safe comparison.

- [ ] **Step 1: Write the failing test**

Create `tests/activation.test.ts` with tests proving the exact code is accepted and a one-character variation is rejected:

```ts
import { describe, expect, it } from "vitest";
import { isActivationCodeValid } from "../src/domain/activation";

describe("offline activation code", () => {
  it("accepts the configured code exactly", () => {
    expect(isActivationCodeValid("ShiFt_2026#")).toBe(true);
  });

  it("rejects an incorrect code", () => {
    expect(isActivationCodeValid("ShiFt_2026")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run `npx vitest run tests/activation.test.ts`. It must fail because `src/domain/activation.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal verifier**

Create `src/domain/activation.ts` with a SHA-256 digest for `ShiFt_2026#` and a `timingSafeEqual` comparison. The exported function returns `false` for non-matching input and never throws for a normal string.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run `npx vitest run tests/activation.test.ts` and expect 2 passing tests.

### Task 2: Wire main-process activation IPC and renderer API

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/shared/api.ts`

**Interfaces:**
- Adds `window.marbleApi.activation.status(): Promise<boolean>`.
- Adds `window.marbleApi.activation.activate(code: string): Promise<boolean>`.
- Stores `activationStatus=activated` and `activationActivatedAt=<ISO timestamp>` only after the main-process verifier accepts the code.

- [ ] **Step 1: Add main-process handlers**

Import `isActivationCodeValid` into `electron/main.ts`, register `activation:status` to read the existing settings table, and register `activation:activate` to validate the string, persist the activation status, and return `true`; return `false` for an invalid code without changing settings.

- [ ] **Step 2: Expose only the two activation methods through preload**

Add an `activation` section to the `MarbleApi` interface and the context-bridge object. Do not expose the expected hash or any database access to the renderer.

- [ ] **Step 3: Run TypeScript checks**

Run `npm run lint`; expected result is exit code 0 with no TypeScript errors.

### Task 3: Add the first-run activation screen and preserve the existing PIN lock

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- The app boot sequence checks activation before rendering the dashboard.
- If activation is absent, `ActivationPage` is rendered and the user must submit the exact code.
- On successful activation, the page transitions directly to the existing application without a restart.
- Existing `PinLock` is still shown on later launches when the optional PIN is configured.

- [ ] **Step 1: Add the failing UI/API integration expectation**

Update the app code to call `window.marbleApi.activation.status()` and add the activation state branch before the dashboard branch; run `npm run lint` so the missing API/types fail before production implementation is complete.

- [ ] **Step 2: Implement the activation state and screen**

Load activation status alongside existing settings, render an Arabic activation card when status is false, submit the entered string to `window.marbleApi.activation.activate`, show an error without clearing application data when invalid, and call the success callback when valid.

- [ ] **Step 3: Add focused activation styling**

Style the activation card using the existing `pin-lock` design language, add a logo image using `./logo-small-light-removebg-preview.png`, support the `#` character in the password input, and keep the layout usable at the existing desktop minimum dimensions.

- [ ] **Step 4: Run lint and the focused activation tests**

Run `npm run lint` and `npx vitest run tests/activation.test.ts`; both must exit 0.

### Task 4: Use the supplied logo for Electron and Windows packaging

**Files:**
- Modify: `electron/main.ts`
- Modify: `package.json`

**Interfaces:**
- The BrowserWindow receives the logo path for development and packaged builds.
- electron-builder receives `public/logo-small-light-removebg-preview.png` as the Windows icon source.

- [ ] **Step 1: Add a shared resolved icon path**

Resolve the existing public PNG relative to the compiled Electron entry so it points to `dist/logo-small-light-removebg-preview.png` in both dev and packaged layouts, then pass it as `BrowserWindow`’s `icon` option.

- [ ] **Step 2: Configure electron-builder**

Change the Windows build configuration from `icon: null` to the supplied public PNG path while preserving the existing NSIS target, native-module packaging, and `npmRebuild: false` safeguards.

- [ ] **Step 3: Run the web build and inspect the copied asset**

Run `npm run build`; expect `dist/logo-small-light-removebg-preview.png` to exist and the build to exit 0.

### Task 5: Verify and package the feature

**Files:**
- Modify: `README.md` if the activation/install instructions need documenting.
- Create/update: generated `dist/` artifacts through the build scripts only.

- [ ] **Step 1: Run the complete automated gates**

Run `npm run lint`, `npm test`, and `npm run build`. Expect TypeScript, all existing tests, the activation tests, and Vite packaging to pass.

- [ ] **Step 2: Build the Windows installer**

Run `npm run dist:win`; expect `dist/إدارة الرخام Setup 0.1.2.exe` (or the incremented package version) to be generated without rebuilding the Windows native module as Linux.

- [ ] **Step 3: Inspect packaged evidence**

Verify the packaged `better_sqlite3.node` is `PE32+ executable for MS Windows x86-64`, extract `dist/index.html` from the ASAR to confirm relative asset paths, verify the logo exists in the packaged UI, and verify the Windows installer file is non-empty.

- [ ] **Step 4: Report the local/offline security boundary**

Tell the user that this is a local first-run activation gate. Since the application intentionally has no server, it cannot notify the owner remotely or provide unforgeable online licensing; a determined person with the packaged files could still reverse-engineer a fixed offline code.
