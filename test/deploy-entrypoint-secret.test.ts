import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

const entrypoints = [
  "deploy/fly/entrypoint.sh",
  "deploy/render/entrypoint.sh",
  "deploy/railway/entrypoint.sh",
  "deploy/coolify/entrypoint.sh",
];

const docPaths = [
  "README.md",
  "deploy/README.md",
  "deploy/fly/README.md",
  "deploy/railway/README.md",
  "deploy/render/README.md",
  "deploy/coolify/README.md",
  "deploy/fly/fly.toml",
  "src/viewer/server.ts",
];

function readText(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

const secretOutputPattern =
  /\$[{]?(?:SECRET|AGENTMEMORY_SECRET)[}]?|cat\s+["']?\$HMAC_FILE["']?|<\s*["']?\$HMAC_FILE["']?/;

function writesSecretToHmacFile(line: string): boolean {
  return /^printf\b/.test(line) && />\s*"\$HMAC_FILE"\s*$/.test(line);
}

function shellOutputLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (line.startsWith("echo ")) return true;
      if (!line.startsWith("printf ")) return false;
      return !writesSecretToHmacFile(line);
    });
}

function expectNoSecretOutput(script: string, path: string): void {
  expect(script, path).not.toContain("AGENTMEMORY_SECRET=$SECRET");
  expect(script, path).not.toContain("Copy this value now");
  expect(script, path).not.toMatch(
    /^\s*cat\s+["']?\$HMAC_FILE["']?(?:\s+.*)?$/m,
  );

  for (const line of shellOutputLines(script)) {
    expect(line, `${path} logs generated secret material`).not.toMatch(
      secretOutputPattern,
    );
  }
}

describe("deploy entrypoint secret handling", () => {
  it("never logs the generated HMAC secret value", () => {
    for (const path of entrypoints) {
      const script = readText(path);
      expectNoSecretOutput(script, path);
    }
  });

  it("catches alternate shell forms that would print the persisted secret", () => {
    const leakySnippets = [
      'echo "$AGENTMEMORY_SECRET"',
      `printf '%s\\n' "$SECRET" >&2`,
      'echo "$(cat "$HMAC_FILE")"',
      'cat "$HMAC_FILE"',
      'cat "$HMAC_FILE" >&2',
    ];

    for (const snippet of leakySnippets) {
      expect(
        () => expectNoSecretOutput(snippet, `fixture: ${snippet}`),
        snippet,
      ).toThrow();
    }
  });

  it("keeps first-boot generation, restrictive storage, and runtime export", () => {
    for (const path of entrypoints) {
      const script = readText(path);

      expect(script, path).toContain('SECRET="$(openssl rand -hex 32)"');
      expect(script, path).toContain(`printf '%s\\n' "$SECRET" > "$HMAC_FILE"`);
      expect(script, path).toContain('chmod 600 "$HMAC_FILE"');
      expect(script, path).toContain('chown "$RUN_AS" "$HMAC_FILE"');
      expect(script, path).toContain(
        'AGENTMEMORY_SECRET="$(cat "$HMAC_FILE")"',
      );
      expect(script, path).toContain("export AGENTMEMORY_SECRET");
    }
  });
});

describe("deploy docs secret retrieval guidance", () => {
  it("does not tell operators to retrieve generated secrets from logs", () => {
    const bannedFragments = [
      ["AGENTMEMORY_SECRET=", "<64 hex chars>"].join(""),
      ["grep", ".*", "AGENTMEMORY_SECRET="].join(""),
      ["printed", " to stdout\\s+exactly once"].join(""),
      ["capture it from the deploy", " logs"].join(""),
      ["first-boot", " logs"].join(""),
      ["fresh secret to the", " logs"].join(""),
      ["printed on", " first boot"].join(""),
      ["copies it from the deploy", " logs"].join(""),
      ["copies it once from", " the deploy logs"].join(""),
    ];

    for (const path of docPaths) {
      const text = readText(path);
      for (const fragment of bannedFragments) {
        expect(
          text,
          `${path} contains stale log guidance: ${fragment}`,
        ).not.toMatch(new RegExp(fragment, "i"));
      }
    }
  });
});
