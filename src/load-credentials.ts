import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Bridge systemd-delivered credentials into process.env at runtime.
 *
 * When the unit declares `LoadCredential(Encrypted)=NAME:...`, systemd
 * decrypts the secret into a private per-service tmpfs directory (files mode
 * 0400, owned by the service user) and exposes its path as
 * `$CREDENTIALS_DIRECTORY`. The secret is NOT placed in the process
 * environment, so it never appears in `/proc/<pid>/environ`. This copies each
 * credential file into `process.env`. Assigning at runtime (setenv) does not
 * rewrite the exec environ block, so the value becomes readable in-process
 * while staying invisible in `/proc/<pid>/environ` (verified on the target
 * host: a value set after exec is present in `process.env` but absent from
 * `/proc/self/environ`).
 *
 * Each credential file name maps 1:1 to an env var (a credential named
 * `ANTHROPIC_API_KEY` fills `process.env.ANTHROPIC_API_KEY`). An explicitly
 * set, non-empty environment variable always wins - only blanks are filled -
 * so local/dev overrides and tests keep working unchanged. No-op when
 * `$CREDENTIALS_DIRECTORY` is unset or missing, so non-systemd launches are
 * unaffected.
 */
export function loadSystemdCredentials(): void {
  const dir = process.env["CREDENTIALS_DIRECTORY"];
  if (!dir || !existsSync(dir)) return;

  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }

  for (const name of names) {
    const current = process.env[name];
    if (current !== undefined && current !== "") continue;
    const file = join(dir, name);
    try {
      if (!statSync(file).isFile()) continue;
      const value = readFileSync(file, "utf8").replace(/\r?\n+$/, "");
      if (value) process.env[name] = value;
    } catch {
      // Unreadable credential file - leave the var unset so the consumer
      // surfaces its own clear "X is required" error instead of us masking it.
    }
  }
}
