import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "./version.js";

export interface RuntimeBuildInfo {
  version: string;
  sourceCommit: string;
  sourceDirty: boolean | null;
  builtAt: string;
  artifactHash: string;
}

function candidatePaths(): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return [
    ...(process.env["AGENTMEMORY_BUILD_INFO_PATH"] ? [process.env["AGENTMEMORY_BUILD_INFO_PATH"]] : []),
    join(moduleDir, "build-info.json"),
    join(process.cwd(), "dist", "build-info.json"),
  ];
}

function isBuildInfo(value: unknown): value is RuntimeBuildInfo {
  if (!value || typeof value !== "object") return false;
  const info = value as Record<string, unknown>;
  return (
    typeof info.version === "string" &&
    typeof info.sourceCommit === "string" &&
    (typeof info.sourceDirty === "boolean" || info.sourceDirty === null) &&
    typeof info.builtAt === "string" &&
    typeof info.artifactHash === "string"
  );
}

export async function loadRuntimeBuildInfo(filePath?: string): Promise<RuntimeBuildInfo | null> {
  for (const path of filePath ? [filePath] : candidatePaths()) {
    try {
      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      if (isBuildInfo(parsed)) return parsed;
    } catch {
      // Try the next location. A source checkout may not have been built yet.
    }
  }
  return null;
}

export function fallbackBuildInfo(): RuntimeBuildInfo {
  return {
    version: VERSION,
    sourceCommit: "unknown",
    sourceDirty: null,
    builtAt: "",
    artifactHash: "",
  };
}
