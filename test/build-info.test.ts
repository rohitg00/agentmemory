import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ISdk } from "iii-sdk";
import { registerApiTriggers } from "../src/triggers/api.js";
import { loadRuntimeBuildInfo } from "../src/build-info.js";

type Handler = (request: unknown) => Promise<{ status_code: number; body: unknown }>;

function registerBuildInfoHandler(): Handler {
  const handlers = new Map<string, Handler>();
  const sdk = {
    registerFunction(id: string, handler: Handler) {
      handlers.set(id, handler);
    },
    registerTrigger() {},
  } as unknown as ISdk;
  registerApiTriggers(sdk, {} as never);
  return handlers.get("api::build-info")!;
}

describe("build-info endpoint", () => {
  const previousPath = process.env["AGENTMEMORY_BUILD_INFO_PATH"];
  const temporaryPaths: string[] = [];

  afterEach(() => {
    if (previousPath === undefined) delete process.env["AGENTMEMORY_BUILD_INFO_PATH"];
    else process.env["AGENTMEMORY_BUILD_INFO_PATH"] = previousPath;
    for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true });
  });

  it("returns the current commit, build time, artifact hash, and clean source state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "agentmemory-build-info-"));
    temporaryPaths.push(directory);
    const expected = {
      version: "0.9.27",
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      sourceDirty: false,
      builtAt: "2026-07-13T00:00:00.000Z",
      artifactHash: "a".repeat(64),
    };
    const path = join(directory, "build-info.json");
    writeFileSync(path, JSON.stringify(expected));
    process.env["AGENTMEMORY_BUILD_INFO_PATH"] = path;

    const response = await registerBuildInfoHandler()({ headers: {} });
    expect(response.status_code).toBe(200);
    expect(response.body).toEqual(expected);
    expect(new Date((response.body as typeof expected).builtAt).toISOString()).toBe(expected.builtAt);
    expect((response.body as typeof expected).artifactHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("matches the generated runtime build-info artifact when a build exists", async () => {
    const runtimePath = resolve("dist/build-info.json");
    if (!existsSync(runtimePath)) return;
    const expected = JSON.parse(readFileSync(runtimePath, "utf8"));
    const actual = await loadRuntimeBuildInfo(runtimePath);
    expect(actual).toEqual(expected);
    expect(actual?.sourceDirty).toBe(false);
    expect(actual?.sourceCommit).toBe(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim());
    process.env["AGENTMEMORY_BUILD_INFO_PATH"] = runtimePath;
    const response = await registerBuildInfoHandler()({ headers: {} });
    expect(response.status_code).toBe(200);
    expect(response.body).toEqual(expected);
  });
});
