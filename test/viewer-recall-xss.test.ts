import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("viewer recall trace escaping", () => {
  it("escapes every dynamic dropped-count value before innerHTML interpolation", async () => {
    const viewer = await readFile(join(process.cwd(), "src/viewer/index.html"), "utf8");
    expect(viewer).toContain("esc(String(dropped[k]))");
    expect(viewer).not.toContain("esc(k) + ': ' + dropped[k]");
    const fakeDocument = {
      createElement: () => {
        let text = "";
        return {
          set textContent(value: string) { text = String(value); },
          get innerHTML() {
            return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
          },
        };
      },
    };
    const escSource = viewer.match(/function esc\(s\) \{[\s\S]*?\r?\n    \}/)?.[0];
    expect(escSource).toBeTruthy();
    const esc = new Function("document", `return (${escSource});`)(fakeDocument) as (value: unknown) => string;
    for (const value of [
      "<img src=x onerror=alert(1)>",
      "<script>alert(1)</script>",
      "'\"<>&",
    ]) {
      const rendered = esc(value);
      expect(rendered).not.toContain("<script>");
      expect(rendered).not.toContain("<img");
      expect(rendered).toContain("&lt;");
    }
  });
});
