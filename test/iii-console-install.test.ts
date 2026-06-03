import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("iii console installer (#712)", () => {
  it("runs the installer with bash instead of POSIX sh", () => {
    const cli = readFileSync("src/cli.ts", "utf-8");

    expect(cli).toContain(
      "curl -fsSL https://install.iii.dev/iii/main/install.sh | bash",
    );
    expect(cli).toContain('const bashBin = whichBinary("bash");');
    expect(cli).toContain('runCommand(bashBin, ["-lc", III_CONSOLE_INSTALL_CMD]');
    expect(cli).not.toContain("install.sh | sh");
  });
});
