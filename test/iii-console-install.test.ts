import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("iii console installer (#712)", () => {
  it("runs the installer with bash instead of POSIX sh", () => {
    const cli = readFileSync("src/cli.ts", "utf-8");
    const ensureConsoleBlock =
      cli.match(
        /async function ensureIiiConsole\(\): Promise<IiiConsoleState> \{[\s\S]*?return detectIiiConsole\(\);\n\}/,
      )?.[0] ?? "";
    const consoleInstallCommand =
      cli.match(/const III_CONSOLE_INSTALL_CMD =\n\s+`([^`]+)`;/)?.[1] ?? "";

    expect(consoleInstallCommand).toMatch(
      /curl\s+-fsSL\s+https:\/\/install\.iii\.dev\/iii\/main\/install\.sh\s*\|\s*VERSION=\$\{IIPINNED_VERSION\}\s+bash/,
    );
    expect(ensureConsoleBlock).toMatch(
      /const\s+bashBin\s*=\s*whichBinary\(["']bash["']\);/,
    );
    expect(ensureConsoleBlock).toMatch(
      /runCommand\(\s*bashBin\s*,\s*\[\s*["']-c["']\s*,\s*III_CONSOLE_INSTALL_CMD\s*\]/,
    );
    expect(ensureConsoleBlock).not.toContain('whichBinary("sh")');
    expect(ensureConsoleBlock).not.toContain("runCommand(shBin");
    expect(consoleInstallCommand).not.toMatch(/VERSION=\$\{IIPINNED_VERSION\}\s+sh\b/);
    expect(consoleInstallCommand).not.toMatch(/install\.sh\s*\|\s*sh\b/);
  });
});
