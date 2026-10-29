import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderWorkerCompose } from "../src/cli/compose-project.js";
import { ownedComposeProject, sameComposeFile } from "../src/cli/compose-control.js";

const root = mkdtempSync(join(tmpdir(), "compose-win-"));
const options = (overrides: Record<string, unknown> = {}) => ({
  ports: { restPort: 3511, viewerPort: 3513, enginePort: 49534 },
  dataDir: join(root, "data"),
  projectRoot: join(root, "pkg"),
  nodeBin: "C:\\Program Files\\nodejs\\node.exe",
  homeDir: join(root, "home"),
  startupTimeoutMs: 300_000,
  windows: true,
  ...overrides,
});

describe("Windows Worker Compose render", () => {
  it("renders an unquoted run command and a Windows PATH", () => {
    const text = renderWorkerCompose(options({
      workerEnvironment: { PATH: "C:\\Windows\\system32;C:\\Program Files\\Git\\cmd;c:\\program files\\nodejs" },
    }));
    const parsed = parse(text) as {
      containers: Record<string, { worker?: string; scripts?: { run: string }; environment?: Record<string, string> }>;
    };
    const agent = parsed.containers.agentmemory!;
    expect(agent.scripts!.run).toBe("node.exe dist/index.mjs");
    expect(agent.environment!.PATH).toBe("C:\\Program Files\\nodejs;C:\\Windows\\system32;C:\\Program Files\\Git\\cmd");
    expect(agent.environment!.NoDefaultCurrentDirectoryInExePath).toBe("1");
    expect(agent.worker).toBe(`path://${join(root, "pkg")}`);
    for (const name of ["state", "http", "agentmemory"]) {
      expect(parsed.containers[name]!.scripts?.run ?? "").not.toContain('"');
    }
  });

  it("rejects a Node executable name with spaces or metacharacters", () => {
    expect(() => renderWorkerCompose(options({ nodeBin: "C:\\tools\\my node.exe" }))).toThrow(/must not contain spaces or cmd metacharacters/);
    expect(() => renderWorkerCompose(options({ nodeBin: "C:\\tools\\a&b.exe" }))).toThrow(/must not contain spaces or cmd metacharacters/);
  });

  it("renders local worker binaries unquoted when the path is safe", () => {
    const text = renderWorkerCompose(options({ workerBinDir: "C:\\workers", workerBinDirIsAbsolute: true }));
    const parsed = parse(text) as { containers: Record<string, { scripts?: { run: string } }> };
    expect(parsed.containers.state!.scripts!.run).toBe("C:\\workers\\state");
    expect(parsed.containers.http!.scripts!.run).toBe("C:\\workers\\http");
  });

  it("rejects a local worker directory with spaces or metacharacters", () => {
    expect(() => renderWorkerCompose(options({ workerBinDir: "C:\\Program Files\\workers", workerBinDirIsAbsolute: true }))).toThrow(/AGENTMEMORY_WORKER_BIN_DIR/);
  });

  it("keeps the POSIX render unchanged", () => {
    const posix = renderWorkerCompose(options({ windows: false, nodeBin: "/opt/node/bin/node" }));
    const parsed = parse(posix) as { containers: Record<string, { scripts?: { run: string }; environment?: Record<string, string> }> };
    expect(parsed.containers.agentmemory!.scripts!.run).toBe("'/opt/node/bin/node' 'dist/index.mjs'");
    expect(parsed.containers.agentmemory!.environment!.PATH).toBe("/opt/node/bin:/usr/local/bin:/usr/bin:/bin");
  });
});

describe("sameComposeFile", () => {
  it("matches verbatim and canonical Windows paths", () => {
    expect(sameComposeFile("\\\\?\\C:\\Users\\a\\compose\\worker-compose.yaml", "C:\\Users\\a\\compose\\worker-compose.yaml", true)).toBe(true);
    expect(sameComposeFile("\\\\?\\c:\\users\\a\\worker-compose.yaml", "C:\\Users\\A\\worker-compose.yaml", true)).toBe(true);
    expect(sameComposeFile("\\\\?\\UNC\\srv\\share\\x.yaml", "\\\\srv\\share\\x.yaml", true)).toBe(true);
    expect(sameComposeFile("C:\\Users\\a/worker-compose.yaml", "C:\\Users\\a\\worker-compose.yaml", true)).toBe(true);
  });
  it("stays strict on POSIX and rejects missing left", () => {
    expect(sameComposeFile("/a/b", "/a/B", false)).toBe(false);
    expect(sameComposeFile(undefined, "/a/b", false)).toBe(false);
    expect(sameComposeFile("/a/b", "/a/b", false)).toBe(true);
  });
  it("lets ownedComposeProject find a verbatim-path project", () => {
    const status = {
      projects: [{ file: "\\\\?\\C:\\Users\\a\\compose\\worker-compose.yaml", containers: [] }],
    };
    const found = ownedComposeProject(status as never, "C:\\Users\\a\\compose\\worker-compose.yaml", true);
    expect(found?.file).toBe("\\\\?\\C:\\Users\\a\\compose\\worker-compose.yaml");
  });
});
