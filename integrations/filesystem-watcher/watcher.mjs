import {
  watch,
  promises as fsp,
  statSync,
  existsSync,
  readFileSync,
} from "node:fs";
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

function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!key) continue;
    let val = trimmed.slice(eqIdx + 1).trim();
    const quoteChar = val[0] === '"' || val[0] === "'" ? val[0] : "";
    if (quoteChar) {
      const closeIdx = val.indexOf(quoteChar, 1);
      val = closeIdx === -1 ? val.slice(1) : val.slice(1, closeIdx);
    } else {
      const hashIdx = val.indexOf(" #");
      if (hashIdx !== -1) val = val.slice(0, hashIdx).trim();
    }
    vars[key] = val;
  }
  return vars;
}

function loadAgentMemoryEnv(env) {
  const candidates = [];
  const home = env.HOME || env.USERPROFILE;
  if (home) candidates.push(join(home, ".agentmemory", ".env"));
  if (env.XDG_CONFIG_HOME) {
    candidates.push(join(env.XDG_CONFIG_HOME, "agentmemory", ".env"));
  }

  const fileEnv = {};
  for (const path of candidates) {
    try {
      if (existsSync(path)) {
        Object.assign(fileEnv, parseEnvFile(readFileSync(path, "utf-8")));
      }
    } catch {
      // Keep watcher startup best-effort; explicit process env and defaults still apply.
    }
  }
  return fileEnv;
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
    return TEXT_EXTENSIONS.has(ext);
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
  const merged = { ...loadAgentMemoryEnv(env), ...env };
  const roots = (merged.AGENTMEMORY_FS_WATCH_DIRS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const extraIgnore = (merged.AGENTMEMORY_FS_WATCH_IGNORE || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new RegExp(s));
  return {
    roots,
    baseUrl: merged.AGENTMEMORY_URL,
    secret: merged.AGENTMEMORY_SECRET,
    project: merged.AGENTMEMORY_PROJECT || null,
    sessionId: merged.AGENTMEMORY_SESSION_ID || null,
    ignorePatterns: extraIgnore,
    allowBinary: merged.AGENTMEMORY_FS_WATCH_ALLOW_BINARY === "1",
  };
}

export { relative as _relativeForTests };
