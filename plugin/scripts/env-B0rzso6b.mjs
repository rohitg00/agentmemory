import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

//#region src/hooks/env.ts
let cachedEnv = null;
function parseEnvFile(content) {
	const vars = {};
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eqIdx = line.indexOf("=");
		if (eqIdx === -1) continue;
		const key = line.slice(0, eqIdx).trim();
		let value = line.slice(eqIdx + 1).trim();
		const quote = value[0];
		if (quote === "\"" || quote === "'") {
			const closeIdx = value.indexOf(quote, 1);
			if (closeIdx !== -1) value = value.slice(1, closeIdx);
		} else {
			const hashIdx = value.indexOf(" #");
			if (hashIdx !== -1) value = value.slice(0, hashIdx).trim();
		}
		vars[key] = value;
	}
	return vars;
}
function readAgentmemoryEnvFile() {
	const envPath = join(homedir(), ".agentmemory", ".env");
	if (!existsSync(envPath)) return {};
	try {
		return parseEnvFile(readFileSync(envPath, "utf-8"));
	} catch {
		return {};
	}
}
function agentmemoryEnv(key) {
	const processValue = process.env[key];
	if (processValue !== void 0) return processValue;
	cachedEnv ??= readAgentmemoryEnvFile();
	return cachedEnv[key] ?? "";
}

//#endregion
export { agentmemoryEnv as t };
//# sourceMappingURL=env-B0rzso6b.mjs.map