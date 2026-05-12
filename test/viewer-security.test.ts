import { describe, it, expect } from "vitest";
import { renderViewerDocument } from "../src/viewer/document.js";

describe("viewer document security", () => {
  it("serves a nonce-backed CSP without unsafe-inline script execution", () => {
    const rendered = renderViewerDocument();
    expect(rendered.found).toBe(true);
    if (!rendered.found) return;

    expect(rendered.csp).toContain("script-src 'nonce-");
    expect(rendered.csp).toContain("script-src-attr 'none'");
    expect(rendered.csp).toContain("img-src 'self' data:");
    expect(rendered.csp).not.toContain("script-src 'unsafe-inline'");
    expect(rendered.html).toContain("<script nonce=\"");
    expect(rendered.html).not.toContain("__AGENTMEMORY_VIEWER_NONCE__");
  });

  it("does not contain inline DOM event handlers", () => {
    const rendered = renderViewerDocument();
    expect(rendered.found).toBe(true);
    if (!rendered.found) return;

    expect(rendered.html).not.toContain("onclick=");
    expect(rendered.html).not.toContain("onmouseover=");
    expect(rendered.html).not.toContain("onmouseout=");
  });
});
