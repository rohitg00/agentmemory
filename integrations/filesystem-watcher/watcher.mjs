import { watch, promises as fsp, statSync } from "node:fs";
import { resolve, relative, join, extname, sep, basename } from "node:path";
import { randomBytes } from "node:crypto";

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".cc", ".cpp", ".h", ".hpp",
  ".md", ".mdx", ".txt", ".rst",
  ".json", ".yaml", ".yml", ".toml", ".ini", ".env",
  ".html", ".css", ".scss", ".vue", ".svelte",
  ".sh", ".bash", ".zsh", ".fish",
  ".sql", ".graphql", ".proto",
]);

const DEFAULT_IGNORE = [
  /(?:^|\/)\.git(?:\/|$)/,
  /(?:^|\/)node_modules(?:\/|$)/,
  /(?:^|\/)dist(?:\/|$)/,
  /(?:^|\/)build(?:\/|$)/,
  /(?:^|\/)\.next(?:\/|$)/,
  /(?:^|\/)\.turbo(?:\/|$)/,
  /(?:^|\/)coverage(?:\/|$)/,
  /(?:^|\/)\.DS_Store$/,
  /\.log$/,
  /\.lock$/,
];

const MAX_PREVIEW_BYTES = 4096;
const DEBOUNCE_MS = 500;
const REDACTED = "[REDACTED]";

function isDotEnvPath(path) {
  const name = basename(path).toLowerCase();
  return name === ".env" || name.startsWith(".env.");
}

function isSensitiveKey(key) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return [
    "apikey",
    "accesstoken",
    "accesskey",
    "authorization",
    "bearer",
    "clientsecret",
    "password",
    "passwd",
    "privatekey",
    "pwd",
    "secret",
    "token",
  ].some((needle) => normalized.includes(needle));
}

function redactSensitiveLine(line) {
  const assignment = line.match(
    /^(\s*(?:export\s+)?["']?([A-Za-z_][A-Za-z0-9_.-]*)["']?\s*([=:])\s*)(.*)$/,
  );
  if (assignment && isSensitiveKey(assignment[2])) {
    const bearer = assignment[3] === ":" ? assignment[4].match(/^(Bearer\s+).+/i) : null;
    return `${assignment[1]}${bearer ? bearer[1] : ""}${REDACTED}`;
  }
  return line.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}\b/gi, `$1${REDACTED}`);
}

function redactSensitivePreview(preview) {
  return preview.split("\n").map(redactSensitiveLine).join("\n");
}

export class FilesystemWatcher {
  constructor(config = {}) {
    this.roots = (config.roots || []).map((r) => resolve(r));
    this.baseUrl = (config.baseUrl || "http://localhost:3111").replace(/\/+$/, "");
    this.secret = config.secret;
    this.project =
      config.project ||
      (this.roots[0] ? basename(this.roots[0]) : "filesystem-watcher");
    this.sessionId =
      config.sessionId ||
      `fs-watcher-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
    this.ignore = [...DEFAULT_IGNORE, ...(config.ignorePatterns || [])];
    this.allowBinary = Boolean(config.allowBinary);
    this.logger = config.logger || console;
    this.watchers = [];
    this.pendingByPath = new Map();
  }

  isIgnored(path) {
    return this.ignore.some((re) => re.test(path));
  }

  isTextFile(path) {
    if (this.allowBinary) return true;
    const ext = extname(path).toLowerCase();
    return TEXT_EXTENSIONS.has(ext) || isDotEnvPath(path);
  }

  async readPreview(path) {
    try {
      const fh = await fsp.open(path, "r");
      try {
        const buf = Buffer.alloc(MAX_PREVIEW_BYTES);
        const { bytesRead } = await fh.read(buf, 0, MAX_PREVIEW_BYTES, 0);
        return buf.slice(0, bytesRead).toString("utf-8");
      } finally {
        await fh.close();
      }
    } catch {
      return null;
    }
  }

  async emit(event) {
    const headers = { "content-type": "application/json" };
    if (this.secret) headers.authorization = `Bearer ${this.secret}`;
    try {
      const res = await fetch(`${this.baseUrl}/agentmemory/observe`, {
        method: "POST",
        headers,
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        this.logger.warn?.(
          `[fs-watcher] observe ${res.status}: ${await res.text().catch(() => "")}`,
        );
      }
    } catch (err) {
      this.logger.warn?.(`[fs-watcher] observe failed: ${err?.message || err}`);
    }
  }

  schedule(rootDir, relPath) {
    const key = join(rootDir, relPath);
    const existing = this.pendingByPath.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      this.pendingByPath.delete(key);
      this.flush(rootDir, relPath).catch((err) =>
        this.logger.warn?.(`[fs-watcher] flush failed: ${err?.message || err}`),
      );
    }, DEBOUNCE_MS);
    this.pendingByPath.set(key, { timer });
  }

  async flush(rootDir, relPath) {
    const absPath = join(rootDir, relPath);
    if (this.isIgnored(relPath)) return;
    let exists = true;
    let size = 0;
    try {
      const st = statSync(absPath);
      if (!st.isFile()) return;
      size = st.size;
    } catch {
      exists = false;
    }
    const changeKind = exists ? "file_change" : "file_delete";
    let preview = null;
    if (exists && this.isTextFile(absPath)) {
      preview = await this.readPreview(absPath);
      if (preview !== null) preview = redactSensitivePreview(preview);
    }
    const truncated = exists && size > MAX_PREVIEW_BYTES;
    const payload = {
      hookType: "post_tool_use",
      sessionId: this.sessionId,
      project: this.project,
      cwd: rootDir,
      timestamp: new Date().toISOString(),
      data: {
        source: "filesystem-watcher",
        changeKind,
        files: [relPath],
        content: this.formatContent(relPath, changeKind, preview, {
          size,
          truncated,
        }),
        rootDir,
        absPath,
        size,
        truncated,
      },
    };
    await this.emit(payload);
  }

  formatContent(relPath, changeKind, preview, { size, truncated }) {
    if (changeKind === "file_delete") return `deleted: ${relPath}`;
    const head = `${relPath} (${size} bytes${truncated ? ", truncated" : ""})`;
    if (preview === null) return head;
    return `${head}\n\n${preview}`;
  }

  start() {
    if (this.roots.length === 0) {
      throw new Error("filesystem-watcher: at least one root directory is required");
    }
    const failures = [];
    for (const root of this.roots) {
      try {
        const handle = watch(
          root,
          { recursive: true, persistent: true },
          (_eventType, filename) => {
            if (!filename) return;
            const rel = filename.split(sep).join("/");
            if (this.isIgnored(rel)) return;
            this.schedule(root, rel);
          },
        );
        handle.on("error", (err) => {
          this.logger.warn?.(`[fs-watcher] watch error on ${root}: ${err?.message || err}`);
        });
        this.watchers.push(handle);
        this.logger.info?.(`[fs-watcher] watching ${root}`);
      } catch (err) {
        const msg = err?.message || String(err);
        failures.push(`${root}: ${msg}`);
        this.logger.error?.(`[fs-watcher] failed to watch ${root}: ${msg}`);
      }
    }
    if (this.watchers.length === 0) {
      throw new Error(
        `filesystem-watcher: could not watch any of the configured roots. ` +
          `If you are on Node 18 + Linux, recursive fs.watch requires Node >=19.1.0; upgrade to Node 20 LTS or newer. ` +
          `Failures: ${failures.join("; ")}`,
      );
    }
  }

  stop() {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {}
    }
    this.watchers = [];
    for (const { timer } of this.pendingByPath.values()) {
      clearTimeout(timer);
    }
    this.pendingByPath.clear();
  }
}

// Small helper used by tests and bin.mjs to parse env.
export function configFromEnv(env = process.env) {
  const roots = (env.AGENTMEMORY_FS_WATCH_DIRS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const extraIgnore = (env.AGENTMEMORY_FS_WATCH_IGNORE || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new RegExp(s));
  return {
    roots,
    baseUrl: env.AGENTMEMORY_URL,
    secret: env.AGENTMEMORY_SECRET,
    project: env.AGENTMEMORY_PROJECT || null,
    sessionId: env.AGENTMEMORY_SESSION_ID || null,
    ignorePatterns: extraIgnore,
    allowBinary: env.AGENTMEMORY_FS_WATCH_ALLOW_BINARY === "1",
  };
}

export { relative as _relativeForTests };
