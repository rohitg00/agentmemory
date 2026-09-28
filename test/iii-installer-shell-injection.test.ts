// Regression test: the iii-engine installer built a shell command by interpolating
// $HOME-derived paths into a `sh -c` string, so a path containing a double quote
// could close the quoting and run arbitrary commands.
//
// Two layers, because either alone is weak: the source scan pins the shape of the
// call, and the behavioural test proves the shape actually resists a hostile path
// by running it through a real shell.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

describe("iii-engine installer command construction", () => {
  const source = readFileSync("src/cli.ts", "utf8");

  it("passes installer paths as argv, never interpolated into the script", () => {
    const start = source.indexOf("async function runIiiInstaller");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(
      start,
      source.indexOf("async function", start + 10),
    );

    // The script must be a literal: no ${...} inside the string handed to sh -c.
    const scriptMatch = body.match(
      /const installScript\s*=\s*([\s\S]*?);\r?\n/,
    );
    expect(scriptMatch, "installScript should exist").not.toBeNull();
    expect(scriptMatch![1]).not.toContain("${");

    // ...and the values must arrive as positional parameters instead.
    expect(body).toContain(
      '"-c", installScript, "sh", binDir, binPath, releaseUrl',
    );
  });

  it("survives a path containing a double quote (the real shell decides this)", () => {
    // Only a POSIX sh can answer this honestly; skip where there isn't one.
    let sh: string;
    try {
      sh = execFileSync(
        process.platform === "win32" ? "where" : "which",
        ["sh"],
        {
          encoding: "utf8",
        },
      )
        .split(/\r?\n/)[0]
        .trim();
    } catch {
      return;
    }
    if (!sh) return;

    const tmp = mkdtempSync(join(tmpdir(), "iii-inject-"));
    const marker = join(tmp, "PWNED").split(sep).join("/");
    // A directory name that closes the quote and appends a command.
    const hostileDir = `${tmp.split(sep).join("/")}/a"; touch "${marker}`;

    try {
      // Exactly the shape src/cli.ts now uses: literal script + positional args.
      const installScript = 'mkdir -p "$1"';
      execFileSync(sh, ["-c", installScript, "sh", hostileDir], {
        stdio: "ignore",
      });
    } catch {
      // mkdir may fail on the odd name — that is fine. The assertion below is
      // about whether the injected command ran, not whether mkdir succeeded.
    }

    const injected = existsSync(marker);
    rmSync(tmp, { recursive: true, force: true });
    expect(injected, "the appended command must not execute").toBe(false);
  });

  it("positive control: the old interpolated form really was exploitable", () => {
    // Without this the test above proves nothing -- it would pass against a shell
    // that simply ignored the path. Here we run the ORIGINAL construction and
    // require that it does get exploited, which is what makes the fix meaningful.
    let sh: string;
    try {
      sh = execFileSync(
        process.platform === "win32" ? "where" : "which",
        ["sh"],
        {
          encoding: "utf8",
        },
      )
        .split(/\r?\n/)[0]
        .trim();
    } catch {
      return;
    }
    if (!sh) return;

    const tmp = mkdtempSync(join(tmpdir(), "iii-inject-ctl-"));
    const marker = join(tmp, "PWNED").split(sep).join("/");
    const hostileDir = `${tmp.split(sep).join("/")}/a"; touch "${marker}`;

    try {
      // The pre-fix shape: the path is interpolated straight into the script.
      execFileSync(sh, ["-c", `mkdir -p "${hostileDir}"`], { stdio: "ignore" });
    } catch {
      // ignored -- see above
    }

    const injected = existsSync(marker);
    rmSync(tmp, { recursive: true, force: true });
    expect(injected, "old form should have been injectable").toBe(true);
  });
});
