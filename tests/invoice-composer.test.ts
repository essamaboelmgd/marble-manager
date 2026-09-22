import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceComposerModal } from "../src/App";

describe("invoice composer modal", () => {
  it("renders a labelled dialog only when it is open", () => {
    const close = () => undefined;
    const children = React.createElement("p", null, "نموذج الفاتورة");
    const openMarkup = renderToStaticMarkup(
      React.createElement(InvoiceComposerModal, { open: true, title: "فاتورة شراء جديدة", onClose: close }, children),
    );
    const closedMarkup = renderToStaticMarkup(
      React.createElement(InvoiceComposerModal, { open: false, title: "فاتورة شراء جديدة", onClose: close }, children),
    );

    expect(openMarkup).toContain('role="dialog"');
    expect(openMarkup).toContain("فاتورة شراء جديدة");
    expect(openMarkup).toContain("نموذج الفاتورة");
    expect(closedMarkup).toBe("");
  });
});
