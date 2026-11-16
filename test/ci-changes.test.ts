import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function classify(paths: string[], eventName = "pull_request", options: { missingBase?: boolean; malformed?: boolean; deleted?: boolean; created?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "am-ci-changes-"));
  roots.push(root);
  const env = { PATH: process.env.PATH, HOME: root, USERPROFILE: root, LANG: "C.UTF-8", NO_COLOR: "1", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const put = (path: string, value: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
  git("init");
  git("config", "user.name", "CI fixture");
  git("config", "user.email", "fixture@example.invalid");
  put("README.md", "original\n");
  for (const path of paths) put(path, "original\n");
  git("add", "--all");
  git("commit", "-m", "fixture base");
  const base = git("rev-parse", "HEAD");
  for (const path of paths) {
    if (options.deleted) rmSync(join(root, path));
    else put(path, "changed\n");
  }
  git("add", "--all");
  git("commit", "--allow-empty", "-m", "fixture change");
  const head = git("rev-parse", "HEAD");
  const effectiveBase = options.created ? "0".repeat(40) : options.missingBase ? "f".repeat(40) : base;
  const event = eventName === "pull_request" ? { pull_request: { base: { sha: effectiveBase } } } : { before: effectiveBase };
  const eventPath = join(root, "event.json");
  const output = join(root, "output.txt");
  writeFileSync(eventPath, options.malformed ? "invalid json" : JSON.stringify(event));
  const result = spawnSync(process.execPath, [resolve("scripts/ci-changes.mjs")], {
    cwd: root, encoding: "utf8", timeout: 10_000,
    env: { ...env, GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: eventPath, GITHUB_SHA: head, GITHUB_OUTPUT: output },
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  const decision = JSON.parse(result.stdout) as { runTests: boolean; reason: string; paths?: string[] };
  expect(readFileSync(output, "utf8")).toBe(`run_tests=${decision.runTests}\n`);
  return decision;
}

describe("CI source and documentation routing", () => {
  it.each(["README.md", "docs/guide.yml", "assets/logo.svg", "website/app.tsx", "nested/note.mdx", "deploy/native/README.md"])(
    "keeps quality guards without running the test matrix for %s", (path) => {
      expect(classify([path]).runTests).toBe(false);
    },
  );
  it.each(["src/config.ts", "test/example.test.ts", "package.json", ".env.example", ".github/workflows/ci.yml"])(
    "runs the matrix for %s", (path) => {
      expect(classify([path]).runTests).toBe(true);
    },
  );
  it("keeps source testing when documentation and source change together", () => {
    expect(classify(["README.md", "src/config.ts"]).runTests).toBe(true);
  });
  it("detects deleted source files", () => {
    expect(classify(["src/deleted.ts"], "push", { deleted: true }).runTests).toBe(true);
  });
  it("applies the same documentation policy to pushes", () => {
    expect(classify(["README.md"], "push").runTests).toBe(false);
  });
  it("handles newlines in Git paths without splitting one file into several", () => {
    expect(classify(["docs/line\nbreak.md"]).paths).toEqual(["docs/line\nbreak.md"]);
  });
  it("runs the full matrix on an explicit manual dispatch", () => {
    expect(classify(["README.md"], "workflow_dispatch").runTests).toBe(true);
  });
  it("runs source tests if the comparison commit is unavailable", () => {
    expect(classify(["README.md"], "push", { missingBase: true }).runTests).toBe(true);
  });
  it("runs source tests for a branch without a previous commit", () => {
    expect(classify(["README.md"], "push", { created: true }).runTests).toBe(true);
  });
  it("runs source tests if event data cannot be decoded", () => {
    expect(classify(["README.md"], "pull_request", { malformed: true }).runTests).toBe(true);
  });
});
