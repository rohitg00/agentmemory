import { spawn } from "node:child_process";
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, platform } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
//#region src/secret-store.ts
const SECRET_KEY = "AGENTMEMORY_SECRET";
function agentmemoryHomeDir() {
	return join(homedir(), ".agentmemory");
}
function secretFilePath() {
	return join(agentmemoryHomeDir(), "secret");
}
function usable(value) {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (trimmed.startsWith("${") && trimmed.endsWith("}")) return "";
	return trimmed;
}
function unquote(value) {
	const quote = value[0];
	if ((quote === "\"" || quote === "'") && value.length > 1) {
		const close = value.indexOf(quote, 1);
		if (close !== -1) return value.slice(1, close);
	}
	const hash = value.indexOf(" #");
	return hash === -1 ? value : value.slice(0, hash).trim();
}
function readEnvFileSecret() {
	let content;
	try {
		content = readFileSync(join(agentmemoryHomeDir(), ".env"), "utf-8");
	} catch {
		return "";
	}
	if (typeof content !== "string") return "";
	let found = "";
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		if (trimmed.slice(0, eq).replace(/^export\s+/, "").trim() !== SECRET_KEY) continue;
		found = usable(unquote(trimmed.slice(eq + 1).trim()));
	}
	return found;
}
function readStoredSecret() {
	try {
		return usable(readFileSync(secretFilePath(), "utf-8"));
	} catch {
		return "";
	}
}
function isLoopbackUrl(url) {
	let hostname;
	try {
		hostname = new URL(url).hostname.toLowerCase();
	} catch {
		return false;
	}
	const bare = hostname.replace(/^\[|\]$/g, "");
	return bare === "localhost" || bare === "::1" || /^127(?:\.\d{1,3}){3}$/.test(bare);
}
function resolveClientSecret(baseUrl, env = process.env) {
	const fromEnv = usable(env[SECRET_KEY]);
	if (fromEnv) return fromEnv;
	if (!isLoopbackUrl(baseUrl)) return "";
	return readEnvFileSecret() || readStoredSecret();
}
//#endregion
//#region src/capture/event-id.ts
const HOST_ID_FIELDS = [
	"event_id",
	"eventId",
	"tool_use_id",
	"toolUseId",
	"tool_call_id",
	"toolCallId",
	"call_id",
	"callId",
	"prompt_id",
	"promptId",
	"message_id",
	"messageId"
];
const HOST_TIME_FIELDS = [
	"timestamp",
	"ts",
	"created_at",
	"createdAt",
	"event_time"
];
function stableStringify(value) {
	if (value === void 0) return "null";
	if (value === null || typeof value !== "object") {
		const encoded = JSON.stringify(value);
		return encoded === void 0 ? "null" : encoded;
	}
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	const obj = value;
	return `{${Object.keys(obj).filter((k) => obj[k] !== void 0).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
function hostScalar(host, fields) {
	for (const field of fields) {
		const v = host[field];
		if (typeof v === "string" && v.trim()) return v.trim();
		if (typeof v === "number" && Number.isFinite(v)) return String(v);
	}
}
function digest(parts) {
	return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32);
}
function hasHostIdentity(host) {
	const source = host && typeof host === "object" ? host : {};
	return hostScalar(source, HOST_ID_FIELDS) !== void 0 || hostScalar(source, HOST_TIME_FIELDS) !== void 0;
}
function deriveEventId(hookType, sessionId, host, content) {
	const source = host && typeof host === "object" ? host : {};
	const hostId = hostScalar(source, HOST_ID_FIELDS);
	if (hostId) return `evh_${digest([
		"host",
		sessionId,
		hookType,
		hostId
	])}`;
	return `evc_${digest([
		"content",
		sessionId,
		hookType,
		hostScalar(source, HOST_TIME_FIELDS) ?? "",
		stableStringify(content)
	])}`;
}
//#endregion
//#region src/cli-data-dir.ts
function argValue(args, name) {
	const equals = `${name}=`;
	const inline = args.find((arg) => arg.startsWith(equals));
	if (inline) return inline.slice(equals.length);
	const idx = args.indexOf(name);
	if (idx !== -1) return args[idx + 1];
}
function expandHome(pathValue, home) {
	if (pathValue === "~") return home;
	if (pathValue.startsWith("~/") || pathValue.startsWith("~\\")) return join(home, pathValue.slice(2));
	return pathValue;
}
function absoluteDataDir(pathValue, cwd, home) {
	const expanded = expandHome(pathValue, home);
	return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}
function platformDefaultDataDir(env, home, nodePlatform, useXdg = true) {
	if (nodePlatform === "darwin") return join(home, "Library", "Application Support", "agentmemory");
	if (nodePlatform === "win32") {
		const appData = env["APPDATA"];
		return appData ? join(appData, "agentmemory") : join(home, ".agentmemory");
	}
	const xdgDataHome = env["XDG_DATA_HOME"];
	if (useXdg && xdgDataHome && isAbsolute(xdgDataHome)) return join(xdgDataHome, "agentmemory");
	return join(home, ".local", "share", "agentmemory");
}
function nearestGitParent(pathValue) {
	let current = pathValue;
	while (true) {
		if (existsSync(join(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return void 0;
		current = parent;
	}
}
function isWithin(parent, child) {
	const pathFromParent = relative(parent, child);
	return pathFromParent === "" || pathFromParent !== ".." && !pathFromParent.startsWith(`..${sep}`) && !isAbsolute(pathFromParent);
}
function resolveDataDir(options = {}) {
	const args = options.args ?? process.argv.slice(2);
	const env = options.env ?? process.env;
	const cwd = options.cwd ?? process.cwd();
	const home = options.home ?? homedir();
	const nodePlatform = options.platform ?? platform();
	const parsedInstance = parseInt(argValue(args, "--instance") ?? "0", 10);
	const instance = parsedInstance > 0 && parsedInstance <= 50 ? parsedInstance : 0;
	const forInstance = (dataDir) => instance ? join(dataDir, `instance-${instance}`) : dataDir;
	const flagValue = argValue(args, "--data-dir");
	if (flagValue) return {
		dataDir: forInstance(absoluteDataDir(flagValue, cwd, home)),
		source: "flag"
	};
	const envValue = env["AGENTMEMORY_DATA_DIR"];
	if (envValue) return {
		dataDir: forInstance(absoluteDataDir(envValue, cwd, home)),
		source: "env"
	};
	const legacyDir = resolve(cwd, "data");
	const hasLegacyStore = existsSync(join(legacyDir, "state_store.db")) || existsSync(join(legacyDir, "iii-config.yaml"));
	if (instance === 0 && hasLegacyStore) return {
		dataDir: legacyDir,
		source: "default"
	};
	const defaultDir = platformDefaultDataDir(env, home, nodePlatform);
	const gitParent = nearestGitParent(cwd);
	if (gitParent && isWithin(gitParent, defaultDir)) {
		const relocated = platformDefaultDataDir(env, home, nodePlatform, false);
		if (relocated !== defaultDir) return {
			dataDir: forInstance(relocated),
			source: "default",
			relocatedFrom: defaultDir
		};
	}
	return {
		dataDir: forInstance(defaultDir),
		source: "default"
	};
}
//#endregion
//#region src/functions/privacy.ts
const PRIVATE_TAG_RE = /<private>[\s\S]*?<\/private>/gi;
const SECRET_PATTERN_SOURCES = [
	/(?:api[_-]?key|secret|token|password|credential|auth)[\s]*[=:]\s*["']?[A-Za-z0-9_\-/.+]{20,}["']?/gi,
	/Bearer\s+[A-Za-z0-9._\-+/=]{20,}/gi,
	/sk-proj-[A-Za-z0-9\-_]{20,}/g,
	/(?:sk|pk|rk|ak)-[A-Za-z0-9][A-Za-z0-9\-_]{19,}/g,
	/sk-ant-[A-Za-z0-9\-_]{20,}/g,
	/gh[pus]_[A-Za-z0-9]{36,}/g,
	/github_pat_[A-Za-z0-9_]{22,}/g,
	/xoxb-[A-Za-z0-9\-]+/g,
	/AKIA[0-9A-Z]{16}/g,
	/AIza[A-Za-z0-9\-_]{35}/g,
	/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
	/npm_[A-Za-z0-9]{36}/g,
	/glpat-[A-Za-z0-9\-_]{20,}/g,
	/dop_v1_[A-Za-z0-9]{64}/g
];
const PRIVATE_KEY_BLOCK_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g;
const URL_CREDENTIALS_RE = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@:"'<>]*:[^\s/?#@"'<>]+@/gi;
function stripPrivateData(input) {
	let result = input.replace(PRIVATE_TAG_RE, "[REDACTED]");
	result = result.replace(new RegExp(PRIVATE_KEY_BLOCK_RE.source, PRIVATE_KEY_BLOCK_RE.flags), "[REDACTED_SECRET]");
	result = result.replace(new RegExp(URL_CREDENTIALS_RE.source, URL_CREDENTIALS_RE.flags), "$1[REDACTED_SECRET]@");
	for (const source of SECRET_PATTERN_SOURCES) {
		const pattern = new RegExp(source.source, source.flags);
		result = result.replace(pattern, "[REDACTED_SECRET]");
	}
	return result;
}
//#endregion
//#region src/capture/spool.ts
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const MIN_MAX_BYTES = 64 * 1024;
const DEFAULT_MAX_AGE_HOURS = 168;
const LOCK_STALE_MS = 1e4;
const DRAIN_LOCK_STALE_MS = 12e4;
const ORPHAN_CLAIM_MS = 12e4;
const LOCK_WAIT_MS = 500;
const IMAGE_PLACEHOLDER = "[image dropped from capture spool]";
const BOOT_ID_RE = /^[A-Za-z0-9]{8,64}$/;
const SENT_FILE_RE = /^([A-Za-z0-9]{8,64})-(\d+)\.jsonl$/;
const SENT_BUCKET_MS = 1e3;
const MAX_DURABLE_AFTER_MS = 10 * 6e4;
function emptyStats() {
	return {
		spooled: 0,
		dropped: 0,
		droppedBytes: 0,
		expired: 0,
		delivered: 0,
		duplicates: 0,
		rejected: 0
	};
}
function positiveInt(raw, fallback) {
	if (!raw || !/^\d+$/.test(raw.trim())) return fallback;
	const n = parseInt(raw.trim(), 10);
	return n > 0 ? n : fallback;
}
function spoolPolicy(env = process.env) {
	const maxBytes = Math.max(MIN_MAX_BYTES, positiveInt(env["AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES"], DEFAULT_MAX_BYTES));
	const maxAgeHours = positiveInt(env["AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS"], DEFAULT_MAX_AGE_HOURS);
	return {
		enabled: env["AGENTMEMORY_CAPTURE_SPOOL"] !== "false",
		maxBytes,
		maxAgeMs: maxAgeHours * 36e5,
		maxRecordBytes: Math.min(256 * 1024, Math.floor(maxBytes / 4))
	};
}
function spoolDir(env = process.env) {
	const explicit = env["AGENTMEMORY_CAPTURE_SPOOL_DIR"];
	if (explicit && explicit.trim()) return resolve(explicit.trim());
	return join(resolveDataDir({
		args: [],
		env
	}).dataDir, "capture-spool");
}
const LOOPBACK = new Set([
	"localhost",
	"127.0.0.1",
	"::1",
	"[::1]",
	"0.0.0.0"
]);
function spoolTargetName(url) {
	try {
		const u = new URL(url);
		return `${LOOPBACK.has(u.hostname) ? "local" : u.hostname.toLowerCase().replace(/[^a-z0-9.-]/g, "_")}-${u.port || (u.protocol === "https:" ? "443" : "80")}`;
	} catch {
		return "local-3111";
	}
}
function spoolPaths(url, dir = spoolDir()) {
	const name = spoolTargetName(url);
	return {
		dir,
		name,
		file: join(dir, `${name}.jsonl`),
		lock: join(dir, `${name}.lock`),
		drainLock: join(dir, `${name}.drain.lock`),
		stats: join(dir, `${name}.stats.json`)
	};
}
function ensureDir(dir) {
	mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	try {
		chmodSync(dir, 448);
	} catch {}
}
function sleepSync(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function tryLock(path, staleMs) {
	try {
		const fd = openSync(path, "wx", 384);
		writeSync(fd, `${process.pid}\n`);
		closeSync(fd);
		return true;
	} catch (err) {
		if (err.code !== "EEXIST") return false;
		try {
			if (Date.now() - statSync(path).mtimeMs > staleMs) unlinkSync(path);
		} catch {}
		return false;
	}
}
function releaseLock(path) {
	try {
		unlinkSync(path);
	} catch {}
}
function withLock(path, fn, waitMs = LOCK_WAIT_MS) {
	const deadline = Date.now() + waitMs;
	let locked = tryLock(path, LOCK_STALE_MS);
	while (!locked && Date.now() < deadline) {
		sleepSync(5);
		locked = tryLock(path, LOCK_STALE_MS);
	}
	try {
		return fn(locked);
	} finally {
		if (locked) releaseLock(path);
	}
}
function readSpoolStats(paths) {
	try {
		const parsed = JSON.parse(readFileSync(paths.stats, "utf-8"));
		return {
			...emptyStats(),
			...parsed
		};
	} catch {
		return emptyStats();
	}
}
function writeStats(paths, patch) {
	try {
		const stats = readSpoolStats(paths);
		patch(stats);
		const tmp = `${paths.stats}.${process.pid}.tmp`;
		writeFileSync(tmp, JSON.stringify(stats), { mode: 384 });
		renameSync(tmp, paths.stats);
	} catch {}
}
function fileSize(path) {
	try {
		return statSync(path).size;
	} catch {
		return 0;
	}
}
function sanitizeBody(body) {
	try {
		return JSON.parse(stripPrivateData(JSON.stringify(body)));
	} catch {
		return body;
	}
}
function withoutImage(body) {
	const data = body["data"];
	if (!data || typeof data !== "object" || Array.isArray(data)) return body;
	const d = data;
	if (d["image_data"] === void 0) return body;
	return {
		...body,
		data: {
			...d,
			image_data: IMAGE_PLACEHOLDER
		}
	};
}
function parseLines(text) {
	const records = [];
	let corrupt = 0;
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			const rec = JSON.parse(line);
			if (rec && typeof rec.eventId === "string" && rec.body && typeof rec.body === "object") records.push(rec);
			else corrupt++;
		} catch {
			corrupt++;
		}
	}
	return {
		records,
		corrupt
	};
}
function isExpired(rec, policy, now) {
	const at = Date.parse(rec.spooledAt);
	return Number.isFinite(at) && now - at > policy.maxAgeMs;
}
function serialize(records) {
	return records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
}
function rewriteLocked(paths, records) {
	const tmp = `${paths.file}.${process.pid}.tmp`;
	const fd = openSync(tmp, "w", 384);
	try {
		writeSync(fd, serialize(records));
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	renameSync(tmp, paths.file);
}
function pruneExpiredLocked(paths, policy) {
	if (!existsSync(paths.file)) return 0;
	const { records } = parseLines(readFileSync(paths.file, "utf-8"));
	const now = Date.now();
	const kept = records.filter((r) => !isExpired(r, policy, now));
	const expired = records.length - kept.length;
	if (expired > 0) rewriteLocked(paths, kept);
	return expired;
}
function appendSpool(url, eventId, body, reason, options = {}) {
	const policy = options.policy ?? spoolPolicy();
	if (!policy.enabled) return {
		spooled: false,
		dropped: "disabled"
	};
	const paths = spoolPaths(url, options.dir);
	const note = (dropReason, bytes) => {
		writeStats(paths, (s) => {
			s.dropped++;
			s.droppedBytes += bytes;
			s.lastDropAt = (/* @__PURE__ */ new Date()).toISOString();
			s.lastDropReason = dropReason;
		});
		return {
			spooled: false,
			dropped: dropReason
		};
	};
	try {
		ensureDir(paths.dir);
		const record = {
			v: 1,
			eventId,
			spooledAt: (/* @__PURE__ */ new Date()).toISOString(),
			reason,
			attempts: options.attempts ?? 0,
			body: sanitizeBody(body)
		};
		let line = JSON.stringify(record) + "\n";
		if (Buffer.byteLength(line) > policy.maxRecordBytes) {
			record.body = withoutImage(record.body);
			line = JSON.stringify(record) + "\n";
		}
		const bytes = Buffer.byteLength(line);
		if (bytes > policy.maxRecordBytes) return note("too-large", bytes);
		return withLock(paths.lock, (locked) => {
			let expired = 0;
			if (locked && fileSize(paths.file) + bytes > policy.maxBytes) expired = pruneExpiredLocked(paths, policy);
			const over = fileSize(paths.file) + sentBytes(paths) + bytes - policy.maxBytes;
			if (locked && over > 0) evictSent(paths, over);
			if (fileSize(paths.file) + sentBytes(paths) + bytes > policy.maxBytes) {
				if (expired) writeStats(paths, (s) => void (s.expired += expired));
				return note("full", bytes);
			}
			const fd = openSync(paths.file, "a", 384);
			try {
				writeSync(fd, line);
				fsyncSync(fd);
			} finally {
				closeSync(fd);
			}
			writeStats(paths, (s) => {
				s.spooled++;
				s.expired += expired;
				s.lastSpooledAt = record.spooledAt;
				s.lastSpoolReason = reason;
			});
			return { spooled: true };
		});
	} catch {
		return {
			spooled: false,
			dropped: "error"
		};
	}
}
function listSent(paths) {
	const segments = [];
	let entries;
	try {
		entries = readdirSync(paths.dir);
	} catch {
		return segments;
	}
	const prefix = `${paths.name}.sent-`;
	for (const entry of entries) {
		if (!entry.startsWith(prefix)) continue;
		const match = entry.slice(prefix.length).match(SENT_FILE_RE);
		if (!match) continue;
		const file = join(paths.dir, entry);
		segments.push({
			file,
			bootId: match[1],
			dueAt: Number(match[2]),
			bytes: fileSize(file)
		});
	}
	return segments;
}
function sentBytes(paths) {
	return listSent(paths).reduce((n, s) => n + s.bytes, 0);
}
function evictSent(paths, need) {
	let freed = 0;
	for (const seg of listSent(paths).sort((a, b) => a.dueAt - b.dueAt)) {
		if (freed >= need) return;
		try {
			unlinkSync(seg.file);
			freed += seg.bytes;
		} catch {}
	}
}
function parseSentMark(body) {
	if (!body || typeof body !== "object" || Array.isArray(body)) return null;
	const bootId = body["bootId"];
	const after = body["durableAfterMs"];
	if (typeof bootId !== "string" || !BOOT_ID_RE.test(bootId)) return null;
	if (typeof after !== "number" || !Number.isFinite(after) || after < 0) return null;
	return {
		bootId,
		durableAfterMs: Math.min(Math.ceil(after), MAX_DURABLE_AFTER_MS)
	};
}
function retainSent(url, eventId, body, mark, options = {}) {
	const policy = options.policy ?? spoolPolicy();
	if (!policy.enabled || !BOOT_ID_RE.test(mark.bootId)) return false;
	const paths = spoolPaths(url, options.dir);
	const now = options.now ?? Date.now();
	try {
		ensureDir(paths.dir);
		const record = {
			v: 1,
			eventId,
			spooledAt: new Date(now).toISOString(),
			reason: "sent",
			attempts: 0,
			body: sanitizeBody(body),
			bootId: mark.bootId
		};
		let line = JSON.stringify(record) + "\n";
		if (Buffer.byteLength(line) > policy.maxRecordBytes) {
			record.body = withoutImage(record.body);
			line = JSON.stringify(record) + "\n";
		}
		const bytes = Buffer.byteLength(line);
		if (bytes > policy.maxRecordBytes) return false;
		const dueAt = Math.ceil((now + mark.durableAfterMs) / SENT_BUCKET_MS) * SENT_BUCKET_MS;
		const file = join(paths.dir, `${paths.name}.sent-${mark.bootId}-${dueAt}.jsonl`);
		return withLock(paths.lock, () => {
			if (fileSize(paths.file) + sentBytes(paths) + bytes > policy.maxBytes) return false;
			const fd = openSync(file, "a", 384);
			try {
				writeSync(fd, line);
			} finally {
				closeSync(fd);
			}
			return true;
		});
	} catch {
		return false;
	}
}
function reconcileSent(url, bootId, options = {}) {
	const result = {
		released: 0,
		requeued: 0
	};
	if (!(options.policy ?? spoolPolicy()).enabled) return result;
	const paths = spoolPaths(url, options.dir);
	const now = options.now ?? Date.now();
	for (const seg of listSent(paths)) {
		if (seg.bootId === bootId) {
			if (seg.dueAt > now) continue;
			try {
				unlinkSync(seg.file);
				result.released++;
			} catch {}
			continue;
		}
		const target = join(paths.dir, `${paths.name}.draining-${process.pid}-${now}-${result.requeued}.jsonl`);
		try {
			renameSync(seg.file, target);
		} catch {
			continue;
		}
		try {
			utimesSync(target, 0, 0);
		} catch {}
		result.requeued++;
	}
	return result;
}
function claimFiles(paths) {
	const claimed = [];
	try {
		const prefix = `${paths.name}.draining-`;
		for (const entry of readdirSync(paths.dir)) {
			if (!entry.startsWith(prefix) || !entry.endsWith(".jsonl")) continue;
			const full = join(paths.dir, entry);
			try {
				if (Date.now() - statSync(full).mtimeMs > ORPHAN_CLAIM_MS) claimed.push(full);
			} catch {}
		}
	} catch {}
	if (fileSize(paths.file) > 0) {
		const target = join(paths.dir, `${paths.name}.draining-${process.pid}-${Date.now()}.jsonl`);
		withLock(paths.lock, (locked) => {
			if (!locked) return;
			try {
				renameSync(paths.file, target);
				claimed.push(target);
			} catch {}
		});
	}
	return claimed;
}
function requeueLocked(paths, leftover) {
	if (leftover.length === 0) return;
	const existing = existsSync(paths.file) ? parseLines(readFileSync(paths.file, "utf-8")).records : [];
	rewriteLocked(paths, [...leftover, ...existing]);
}
function requeueUnlocked(paths, leftover) {
	if (leftover.length === 0) return;
	const target = join(paths.dir, `${paths.name}.draining-${process.pid}-${Date.now()}-requeue.jsonl`);
	const fd = openSync(target, "wx", 384);
	try {
		writeSync(fd, serialize(leftover));
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	try {
		utimesSync(target, 0, 0);
	} catch {}
}
function spoolHasRecords(url, dir) {
	return fileSize(spoolPaths(url, dir).file) > 0;
}
function drainInProgress(url, dir) {
	const paths = spoolPaths(url, dir);
	try {
		return Date.now() - statSync(paths.drainLock).mtimeMs < DRAIN_LOCK_STALE_MS;
	} catch {
		return false;
	}
}
async function drainSpool(url, send, options = {}) {
	const policy = options.policy ?? spoolPolicy();
	const result = {
		claimed: 0,
		delivered: 0,
		duplicates: 0,
		rejected: 0,
		expired: 0,
		corrupt: 0,
		remaining: 0
	};
	const paths = spoolPaths(url, options.dir);
	if (!existsSync(paths.dir)) return {
		...result,
		skipped: "empty"
	};
	try {
		ensureDir(paths.dir);
	} catch {}
	if (!tryLock(paths.drainLock, DRAIN_LOCK_STALE_MS)) return {
		...result,
		skipped: "locked"
	};
	try {
		const files = claimFiles(paths);
		if (files.length === 0) return {
			...result,
			skipped: "empty"
		};
		const records = [];
		for (const file of files) try {
			const parsed = parseLines(readFileSync(file, "utf-8"));
			records.push(...parsed.records);
			result.corrupt += parsed.corrupt;
		} catch {}
		result.claimed = records.length;
		const seen = /* @__PURE__ */ new Set();
		const now = Date.now();
		const deadline = options.deadlineMs ? now + options.deadlineMs : Number.POSITIVE_INFINITY;
		const maxRecords = options.maxRecords ?? Number.POSITIVE_INFINITY;
		const leftover = [];
		let stopped = false;
		let processed = 0;
		for (const rec of records) {
			if (seen.has(rec.eventId)) {
				result.duplicates++;
				continue;
			}
			seen.add(rec.eventId);
			if (isExpired(rec, policy, now)) {
				result.expired++;
				continue;
			}
			if (stopped || processed >= maxRecords || Date.now() > deadline) {
				leftover.push(rec);
				continue;
			}
			processed++;
			let outcome;
			try {
				outcome = await send(rec);
			} catch (err) {
				outcome = "retry";
				result.error = err instanceof Error ? err.message : String(err);
			}
			if (outcome === "delivered") result.delivered++;
			else if (outcome === "duplicate") result.duplicates++;
			else if (outcome === "rejected") result.rejected++;
			else {
				stopped = true;
				leftover.push({
					...rec,
					attempts: (rec.attempts ?? 0) + 1
				});
			}
		}
		result.remaining = leftover.length;
		withLock(paths.lock, (locked) => locked ? requeueLocked(paths, leftover) : requeueUnlocked(paths, leftover), 2e3);
		for (const file of files) try {
			unlinkSync(file);
		} catch {}
		writeStats(paths, (s) => {
			s.delivered += result.delivered;
			s.duplicates += result.duplicates;
			s.rejected += result.rejected;
			s.expired += result.expired;
			s.lastDrainAt = (/* @__PURE__ */ new Date()).toISOString();
			s.lastDrainDelivered = result.delivered;
			s.lastDrainDuplicates = result.duplicates;
			s.lastDrainRejected = result.rejected;
			s.lastDrainRemaining = result.remaining;
			if (result.error) s.lastDrainError = result.error;
			else delete s.lastDrainError;
		});
		return result;
	} finally {
		releaseLock(paths.drainLock);
	}
}
//#endregion
//#region src/hooks/_capture.ts
const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = resolveClientSecret(REST_URL);
const DRAIN_CHILD_ENV = "AGENTMEMORY_CAPTURE_DRAIN_CHILD";
const DRAIN_MAX_RECORDS = 500;
const DRAIN_DEADLINE_MS = 2e4;
const DRAIN_REQUEST_TIMEOUT_MS = 5e3;
function authHeaders() {
	const h = { "Content-Type": "application/json" };
	if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
	return h;
}
function withEventId(body, host, content, options = {}) {
	const source = options.stable || hasHostIdentity(host) ? host : {
		...host,
		timestamp: body.timestamp
	};
	return {
		...body,
		eventId: deriveEventId(body.hookType, body.sessionId, source, content ?? body.data)
	};
}
function classify(status) {
	if (status >= 200 && status < 300) return status === 200 ? "duplicate" : "delivered";
	if (status === 408 || status === 429 || status >= 500) return "retry";
	return "rejected";
}
async function post(body, timeoutMs) {
	const res = await fetch(`${REST_URL}/agentmemory/observe`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(timeoutMs)
	});
	const text = await res.text().catch(() => "");
	const outcome = classify(res.status);
	if (outcome !== "delivered" && outcome !== "duplicate") return {
		outcome,
		mark: null
	};
	try {
		return {
			outcome,
			mark: parseSentMark(JSON.parse(text))
		};
	} catch {
		return {
			outcome,
			mark: null
		};
	}
}
function keepUntilDurable(eventId, body, mark) {
	const { requeued } = reconcileSent(REST_URL, mark.bootId);
	retainSent(REST_URL, eventId, body, mark);
	return requeued;
}
function startDrainChild() {
	if (process.env[DRAIN_CHILD_ENV] === "1") return;
	if (!process.argv[1] || drainInProgress(REST_URL)) return;
	try {
		const child = spawn(process.execPath, [process.argv[1]], {
			detached: true,
			stdio: "ignore",
			windowsHide: true,
			env: {
				...process.env,
				[DRAIN_CHILD_ENV]: "1"
			}
		});
		child.on("error", () => {});
		child.unref();
	} catch {}
}
async function captureObservation(body, timeoutMs) {
	const eventId = body.eventId ?? deriveEventId(body.hookType, body.sessionId, null, body.data);
	const payload = {
		...body,
		eventId
	};
	let reason;
	try {
		const { outcome, mark } = await post(payload, timeoutMs);
		if (outcome !== "retry") {
			if ((mark ? keepUntilDurable(eventId, payload, mark) : 0) > 0 || spoolHasRecords(REST_URL)) startDrainChild();
			return outcome;
		}
		reason = "server-error";
	} catch (err) {
		const name = err instanceof Error ? err.name : "";
		reason = name === "TimeoutError" || name === "AbortError" ? "timeout" : "unreachable";
	}
	return appendSpool(REST_URL, eventId, payload, reason).spooled ? "spooled" : "dropped";
}
function isDrainChild() {
	return process.env[DRAIN_CHILD_ENV] === "1";
}
async function runDrainChild() {
	await drainSpool(REST_URL, async (record) => {
		const { outcome, mark } = await post({
			...record.body,
			eventId: record.eventId
		}, DRAIN_REQUEST_TIMEOUT_MS);
		if (mark) retainSent(REST_URL, record.eventId, record.body, mark);
		return outcome;
	}, {
		maxRecords: DRAIN_MAX_RECORDS,
		deadlineMs: DRAIN_DEADLINE_MS
	}).catch(() => void 0);
}
//#endregion
export { REST_URL, authHeaders, captureObservation, isDrainChild, runDrainChild, withEventId };

//# sourceMappingURL=_capture.mjs.map