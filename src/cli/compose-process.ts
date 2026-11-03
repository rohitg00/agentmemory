import { execFileSync } from "node:child_process";
import { readlinkSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";

/**
 * On macOS, ask lsof for the process's text executable and accept only a
 * response explicitly associated with this PID. The `-d txt` filter limits
 * names to text descriptors (the process executable).
 */
export function readMacProcessExecutable(pid: number): string {
  if (!Number.isSafeInteger(pid) || pid <= 0) return "";
  try {
    const output = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "txt", "-Fpn"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    let matchedPid = false;
    for (const line of output.split(/\r?\n/)) {
      if (line.startsWith("p")) {
        if (line !== `p${pid}`) return "";
        matchedPid = true;
        continue;
      }
      if (matchedPid && line.startsWith("n")) {
        const path = line.slice(1);
        if (isAbsolute(path)) return path;
      }
    }
  } catch {
    // A missing lsof, exited process, or malformed response is not a match.
  }
  return "";
}

export function sameResolvedExecutable(actual: string, expected: string, windows = false): boolean {
  try {
    const actualPath = realpathSync(actual);
    const expectedPath = realpathSync(expected);
    return windows
      ? actualPath.toLowerCase() === expectedPath.toLowerCase()
      : actualPath === expectedPath;
  } catch {
    return false;
  }
}

export function readUnixProcessExecutable(pid: number, os: "darwin" | "linux"): string {
  if (!Number.isSafeInteger(pid) || pid <= 0) return "";
  if (os === "darwin") return readMacProcessExecutable(pid);
  try {
    return readlinkSync(`/proc/${pid}/exe`);
  } catch {
    return "";
  }
}

