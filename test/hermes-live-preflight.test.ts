import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const roots: string[] = [];
const PYTHON = execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
const token = (payload: unknown) => `synthetic.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "hermes-live-preflight-"));
  roots.push(root);
  const auth = join(root, "auth.json");
  const out = join(root, "evidence");
  const pkg = join(root, "missing-package");
  const run = () => spawnSync(PYTHON, [
    resolve("test/hermes-live-model.py"),
    "--package", pkg,
    "--host", join(root, "unused-host"),
    "--python", "python3",
    "--engine", join(root, "unused-engine"),
    "--codex-auth", auth,
    "--model", "synthetic-unused-model",
    "--node", process.execPath,
    "--out", out,
  ], {
    encoding: "utf8",
    timeout: 5_000,
    env: { PATH: process.env.PATH, HOME: root, PYTHONDONTWRITEBYTECODE: "1" },
  });
  return { auth, out, pkg, run };
}

describe("Hermes live-model preflight", () => {
  const invalidStores: [string, string][] = [
    ["invalid JSON", "{"],
    ["null store", "null"],
    ["array store", "[]"],
    ["missing tokens", "{}"],
    ["null tokens", '{"tokens":null}'],
    ["array tokens", '{"tokens":[]}'],
    ["missing access token", '{"tokens":{}}'],
    ["non-string access token", '{"tokens":{"access_token":42}}'],
    ["empty access token", '{"tokens":{"access_token":""}}'],
    ["malformed JWT", JSON.stringify({ tokens: { access_token: "synthetic-invalid" } })],
    ["invalid JWT payload", JSON.stringify({ tokens: { access_token: "synthetic.bm90LWpzb24.signature" } })],
    ["array JWT payload", JSON.stringify({ tokens: { access_token: token([]) } })],
    ["missing expiry", JSON.stringify({ tokens: { access_token: token({}) } })],
    ["expired token", JSON.stringify({ tokens: { access_token: token({ exp: 1 }) } })],
    ["non-numeric expiry", JSON.stringify({ tokens: { access_token: token({ exp: "invalid" }) } })],
  ];

  it.each(invalidStores)("leaves output reusable after %s", (_name, contents) => {
    const { auth, out, run } = fixture();
    writeFileSync(auth, contents, { mode: 0o600 });
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = run();
      const diagnostics = [result.error?.message, result.signal, result.stderr, result.stdout].filter(Boolean).join("\n");
      expect(result.error, diagnostics).toBeUndefined();
      expect(result.signal, diagnostics).toBeNull();
      expect(result.status, diagnostics).toBe(1);
      expect(result.stderr).not.toContain("Use a fresh output directory");
      expect(result.stderr).not.toContain("missing-package");
      expect(existsSync(out)).toBe(false);
      expect(readFileSync(auth, "utf8")).toBe(contents);
    }
  }, 15_000);

  it.each(["missing", "directory"])("does not create output for an unreadable %s auth store", (kind) => {
    const { auth, out, run } = fixture();
    if (kind === "directory") mkdirSync(auth);
    const result = run();
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    expect(existsSync(out)).toBe(false);
  }, 10_000);

  it("allows corrected credentials to reach the package preflight on the same output path", () => {
    const { auth, out, run } = fixture();
    writeFileSync(auth, '{"tokens":{}}', { mode: 0o600 });
    expect(run().stderr).toContain("no access token");
    const corrected = JSON.stringify({ tokens: { access_token: token({ exp: Math.floor(Date.now() / 1_000) + 3_600 }) } });
    writeFileSync(auth, corrected);
    const result = run();
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("missing-package");
    expect(result.stderr).not.toContain("Use a fresh output directory");
    expect(existsSync(out)).toBe(false);
    expect(readFileSync(auth, "utf8")).toBe(corrected);
  }, 15_000);

  it("preserves existing evidence before checking credentials", () => {
    const { out, run } = fixture();
    mkdirSync(out);
    writeFileSync(join(out, "previous.json"), "previous evidence");
    const result = run();
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("Use a fresh output directory");
    expect(readFileSync(join(out, "previous.json"), "utf8")).toBe("previous evidence");
  }, 10_000);

  it.each(["provider", "engine"])("does not create output before the %s input is readable", (missing) => {
    const { auth, out, pkg, run } = fixture();
    const credentials = JSON.stringify({ tokens: { access_token: token({ exp: Math.floor(Date.now() / 1_000) + 3_600 }) } });
    writeFileSync(auth, credentials, { mode: 0o600 });
    mkdirSync(join(pkg, "dist"), { recursive: true });
    writeFileSync(join(pkg, "dist/cli.mjs"), "throw new Error('CLI must not start during preflight');");
    if (missing === "engine") {
      mkdirSync(join(pkg, "integrations/hermes"), { recursive: true });
      writeFileSync(join(pkg, "integrations/hermes/__init__.py"), "");
    }
    const result = run();
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(missing === "provider" ? "__init__.py" : "unused-engine");
    expect(existsSync(out)).toBe(false);
    expect(readFileSync(auth, "utf8")).toBe(credentials);
  }, 10_000);
});
