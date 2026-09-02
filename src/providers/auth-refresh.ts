import { execFile } from "node:child_process";
import { logger } from "../logger.js";

/**
 * Conservative classifier for "credentials/token expired" errors from Bedrock
 * or the underlying AWS STS / SSO layer. Kept to a narrow allow-list so that
 * genuine errors (bad request, throttling, model-access denials) are NOT
 * mistaken for an expiry and do not trigger a refresh.
 */
export function isAuthExpiry(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? "";
  const code = (err as { code?: string })?.code ?? "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  const haystack = `${name} ${code} ${message}`;
  return (
    // STS / signed-request side: the token literally "expired".
    /ExpiredToken|ExpiredTokenException|(?:security )?token (?:included in the request )?(?:is |has )?expired|credentials? (?:have )?expired/i.test(
      haystack,
    ) ||
    // SSO-cache side: the cached session token may be reported as expired OR
    // (after `aws sso logout` / first run) "not found or is invalid" — the word
    // "expired" never appears. Match an SSO-session phrase paired with any of
    // those states, bounded so it can't run away across the whole message.
    /SSO session[\w\s=.,'"-]*?(?:has expired|not found|is invalid|invalid|expired)/i.test(
      haystack,
    ) ||
    // AWS's own remediation hint: when it tells you to re-run `aws sso login`,
    // the situation is by definition a credential refresh. Strong, version-
    // stable signal that complements the message-state matching above.
    /\baws sso login\b/i.test(haystack)
  );
}

/**
 * Parse a configured command string into argv WITHOUT a shell. Supports simple
 * single/double quoting so `--profile "my profile"` works; intentionally does
 * NOT support shell features (pipes, expansion, substitution) — the command is
 * run via execFile, not a shell, which is the trust boundary.
 */
export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}

export interface AuthRefreshOptions {
  /** Full command string, e.g. `aws sso login --profile my-sso-profile`. */
  command: string;
  /** Hard timeout for the spawned command (ms). */
  timeoutMs?: number;
  /** Minimum interval between refresh attempts (ms) — prevents login storms. */
  cooldownMs?: number;
  /**
   * Suppression window (ms) applied AFTER a timed-out attempt. A timeout means an
   * interactive login (e.g. a browser device-auth page) was almost certainly left
   * open awaiting approval; re-running would stack up more stale login pages. We
   * back off for much longer than the ordinary cooldown so the user has time to
   * complete (or abandon) the pending login. Default: 15 min.
   */
  postTimeoutCooldownMs?: number;
}

/**
 * Runs a user-configured credential-refresh command (e.g. `aws sso login`) when
 * a provider call fails with an expired-token error. Equivalent in spirit to
 * Claude Code's `awsAuthRefresh` setting.
 *
 * Safeguards:
 *  - Single-flight: concurrent callers share one in-flight run.
 *  - Cooldown: refuses to re-run within `cooldownMs` of the last attempt.
 *  - Post-timeout backoff: after a timeout, suppresses re-runs for
 *    `postTimeoutCooldownMs` so a hung interactive login isn't relaunched on
 *    every background trigger (which would fill the browser with stale pages).
 *  - Timeout: the spawned command is killed after `timeoutMs`.
 *  - No shell: the command is tokenized and executed via execFile, and only the
 *    configured string is ever run — no untrusted data is interpolated.
 */
export class AuthRefresh {
  private readonly argv: string[];
  private readonly timeoutMs: number;
  private readonly cooldownMs: number;
  private readonly postTimeoutCooldownMs: number;
  private inFlight: Promise<void> | null = null;
  private lastAttemptAt: number | null = null;
  /** Set when the previous attempt timed out — gates re-runs for longer. */
  private suppressedUntil: number | null = null;

  constructor(opts: AuthRefreshOptions) {
    this.argv = tokenizeCommand(opts.command);
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.cooldownMs = opts.cooldownMs ?? 10_000;
    this.postTimeoutCooldownMs = opts.postTimeoutCooldownMs ?? 900_000;
  }

  /**
   * Run the refresh command. Single-flight + cooldown guarded. Resolves when the
   * command exits 0; rejects on non-zero exit, timeout, empty command, or while a
   * post-timeout suppression window is active.
   */
  async run(): Promise<void> {
    if (this.inFlight) return this.inFlight;

    const now = Date.now();

    // Post-timeout backoff: a prior attempt timed out, so an interactive login is
    // likely still pending. Don't launch another until the window elapses.
    if (this.suppressedUntil !== null && now < this.suppressedUntil) {
      const waitMs = this.suppressedUntil - now;
      logger.warn("auth refresh suppressed after a prior timeout", {
        command: this.argv[0],
        retryInMs: waitMs,
      });
      throw new Error(
        `auth refresh suppressed: a previous attempt timed out; not retrying for ` +
          `another ${waitMs}ms (a pending interactive login may still be open)`,
      );
    }

    if (this.lastAttemptAt !== null && now - this.lastAttemptAt < this.cooldownMs) {
      logger.info("auth refresh skipped (cooldown)", {
        sinceLastMs: now - this.lastAttemptAt,
        cooldownMs: this.cooldownMs,
      });
      throw new Error(
        `auth refresh skipped: last attempt was ${now - this.lastAttemptAt}ms ago ` +
          `(cooldown ${this.cooldownMs}ms)`,
      );
    }
    this.lastAttemptAt = now;

    if (this.argv.length === 0) {
      throw new Error("auth refresh command is empty");
    }

    const [cmd, ...args] = this.argv;
    logger.info("auth refresh: running credential command", { command: cmd });
    this.inFlight = new Promise<void>((resolve, reject) => {
      execFile(cmd, args, { timeout: this.timeoutMs }, (err) => {
        if (err) {
          // execFile flags a timeout kill via `killed` + the configured signal.
          const timedOut =
            (err as { killed?: boolean }).killed === true ||
            (err as { signal?: string }).signal === "SIGTERM";
          if (timedOut) {
            this.suppressedUntil = Date.now() + this.postTimeoutCooldownMs;
            logger.error("auth refresh command timed out", {
              command: cmd,
              timeoutMs: this.timeoutMs,
              suppressForMs: this.postTimeoutCooldownMs,
            });
          } else {
            logger.error("auth refresh command failed", {
              command: cmd,
              error: err.message,
            });
          }
          reject(err);
        } else {
          logger.info("auth refresh: credential command succeeded", {
            command: cmd,
          });
          resolve();
        }
      });
    }).finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }
}
