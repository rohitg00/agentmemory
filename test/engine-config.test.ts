import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearPersistedBuiltinConfig,
  persistedBuiltinConfigPaths,
  renderEngineConfig,
} from "../src/cli/engine-config.js";

describe("renderEngineConfig", () => {
  it("stores engine state in the resolved data directory", () => {
    const source = readFileSync(
      join(import.meta.dirname, "..", "iii-config.yaml"),
      "utf8",
    );
    const dataDir = join("/var", "lib", "agentmemory");

    const rendered = renderEngineConfig(source, { dataDir });

    expect(rendered).toContain(
      `file_path: '${join(dataDir, "state_store.db")}'`,
    );
    expect(rendered).toContain(
      `file_path: '${join(dataDir, "stream_store")}'`,
    );
    expect(rendered).not.toContain("./data/");
  });

  it("moves the complete native port quartet from one REST override", () => {
    const source = readFileSync(
      join(import.meta.dirname, "..", "iii-config.yaml"),
      "utf8",
    );

    const rendered = renderEngineConfig(source, {
      dataDir: "/tmp/agentmemory",
      ports: {
        restPort: 3211,
        streamPort: 3212,
        viewerPort: 3213,
        enginePort: 49234,
      },
    });

    expect(rendered).toMatch(
      /- name: iii-http\n\s+config:\n\s+port: 3211/,
    );
    expect(rendered).toMatch(
      /- name: iii-stream\n\s+config:\n\s+port: 3212/,
    );
    expect(rendered).toContain(
      'allowed_origins: ["http://localhost:3211", "http://localhost:3213", "http://127.0.0.1:3211", "http://127.0.0.1:3213"]',
    );
    expect(rendered).toMatch(
      /- name: iii-worker-manager\n\s+config:\n\s+port: 49234\n\s+host: 127\.0\.0\.1/,
    );
  });
});

describe("clearPersistedBuiltinConfig", () => {
  it("lists one persisted entry per seeded builtin under data/configuration", () => {
    const paths = persistedBuiltinConfigPaths("/srv/engine");

    expect(paths).toContain(
      join("/srv/engine", "data", "configuration", "iii-http.yaml"),
    );
    expect(paths).toContain(
      join("/srv/engine", "data", "configuration", "iii-worker-manager.yaml"),
    );
    expect(paths.every((p) => p.endsWith(".yaml"))).toBe(true);
  });

  it("removes persisted builtin entries and leaves everything else in place", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agentmemory-engine-"));
    const dir = join(cwd, "data", "configuration");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "iii-http.yaml"), "id: iii-http\nvalue:\n  port: 3111\n");
    writeFileSync(join(dir, "iii-state.yaml"), "id: iii-state\nvalue: {}\n");
    writeFileSync(join(dir, "agentmemory.yaml"), "id: agentmemory\nvalue: {}\n");

    const cleared = clearPersistedBuiltinConfig(cwd);

    expect(cleared).toHaveLength(2);
    expect(existsSync(join(dir, "iii-http.yaml"))).toBe(false);
    expect(existsSync(join(dir, "iii-state.yaml"))).toBe(false);
    expect(existsSync(join(dir, "agentmemory.yaml"))).toBe(true);
  });

  it("is a no-op when the engine has never persisted anything", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agentmemory-engine-"));

    expect(clearPersistedBuiltinConfig(cwd)).toEqual([]);
  });

  it("fails loudly when a persisted entry exists but cannot be removed", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agentmemory-engine-"));
    mkdirSync(join(cwd, "data", "configuration", "iii-http.yaml"), { recursive: true });

    expect(() => clearPersistedBuiltinConfig(cwd)).toThrow(/iii-http\.yaml/);
  });
});
