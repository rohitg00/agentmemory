import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const viewer = readFileSync("src/viewer/index.html", "utf-8");

function extractFunction(name: string): string {
  const start = viewer.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in viewer`);
  let depth = 0;
  for (let i = viewer.indexOf("{", start); i < viewer.length; i++) {
    if (viewer[i] === "{") depth++;
    if (viewer[i] === "}") {
      depth--;
      if (depth === 0) return viewer.slice(start, i + 1);
    }
  }
  throw new Error(`function ${name} is not balanced`);
}

const esc = "function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }";

const memoryHeadline = new Function(`${extractFunction("memoryHeadline")}\nreturn memoryHeadline;`)() as (m: {
  title?: string;
  content?: string;
}) => { head: string; excerpt: string };

const diffWordsHtml = new Function(`${esc}\n${extractFunction("diffWordsHtml")}\nreturn diffWordsHtml;`)() as (
  a: string,
  b: string,
) => { html: string; added: number; removed: number } | null;

describe("viewer memories page", () => {
  it("never repeats the title as the excerpt", () => {
    const content = "Checkout totals must apply coupons before free-shipping thresholds; the reverse order under-charges orders.";
    const derived = memoryHeadline({ title: content.slice(0, 80), content });
    expect(derived.head).toBe("Checkout totals must apply coupons before free-shipping thresholds");
    expect(derived.excerpt).toBe("the reverse order under-charges orders.");

    const clause = memoryHeadline({ title: "", content: "The orders endpoint returns 409 when the cart is stale: the client must refetch." });
    expect(clause.head).toBe("The orders endpoint returns 409 when the cart is stale: the client must refetch.");
    const colonTitle = memoryHeadline({ title: "Deploy steps:", content: "Build, push, helm upgrade." });
    expect(colonTitle.head).toBe("Deploy steps");

    const short = memoryHeadline({ title: "Prefer React Query", content: "Prefer React Query" });
    expect(short).toEqual({ head: "Prefer React Query", excerpt: "" });

    const custom = memoryHeadline({ title: "Auth", content: "JWTs are validated with jose" });
    expect(custom).toEqual({ head: "Auth", excerpt: "JWTs are validated with jose" });

    const long = "word ".repeat(80).trim();
    const cut = memoryHeadline({ title: long.slice(0, 80), content: long });
    expect(cut.head.endsWith("…")).toBe(true);
    expect(cut.excerpt.startsWith("…")).toBe(true);
  });

  it("marks removed and added words between two versions", () => {
    const diff = diffWordsHtml("watch rollout for 5 minutes", "watch rollout for 10 minutes <b>");
    expect(diff).not.toBeNull();
    expect(diff!.html).toContain("<del>5</del>");
    expect(diff!.html).toContain("<ins>10</ins>");
    expect(diff!.html).toContain("&lt;b&gt;");
    expect(diff!.added).toBe(2);
    expect(diff!.removed).toBe(1);
    expect(diffWordsHtml("same", "same")).toMatchObject({ added: 0, removed: 0 });
  });

  it("routes edits through evolve and forgets through governance delete, with no per-row delete", () => {
    expect(extractFunction("saveMemoryEdit")).toMatch(/api\('evolve'/);
    expect(extractFunction("forgetMemories")).toMatch(/apiDelete\('governance\/memories'/);
    expect(extractFunction("memoryRowHtml")).not.toMatch(/btn-danger|forget/i);
    expect(viewer).toMatch(/memory: \{ path: 'memories\?latest=true&limit=100&facets=true'/);
  });
});
