import { execSync } from "node:child_process";
import { basename } from "node:path";

//#region src/hooks/_project.ts
function resolveProject(cwd) {
	const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
	if (explicit && explicit.trim()) return explicit.trim();
	const dir = (typeof cwd === "string" ? cwd.trim() : "") || process.cwd();
	try {
		const top = execSync("git rev-parse --show-toplevel", {
			cwd: dir,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 500
		}).toString().trim();
		if (top) return basename(top);
	} catch {}
	return basename(dir);
}

//#endregion
export { resolveProject as t };
//# sourceMappingURL=_project--Krf34Q5.mjs.map