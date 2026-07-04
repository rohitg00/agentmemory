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

    expect(consoleInstallCommand).toBe(
      "curl -fsSL https://install.iii.dev/iii/main/install.sh | VERSION=${IIPINNED_VERSION} bash",
    );
    expect(ensureConsoleBlock).toContain('const bashBin = whichBinary("bash");');
    expect(ensureConsoleBlock).toContain(
      'runCommand(bashBin, ["-c", III_CONSOLE_INSTALL_CMD]',
    );
    expect(ensureConsoleBlock).not.toContain('whichBinary("sh")');
    expect(ensureConsoleBlock).not.toContain("runCommand(shBin");
    expect(consoleInstallCommand).not.toContain("VERSION=${IIPINNED_VERSION} sh");
    expect(consoleInstallCommand).not.toContain("install.sh | sh");
  });
});
