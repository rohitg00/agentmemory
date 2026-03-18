//#region src/state/schema.ts
const KV = {
	sessions: "mem:sessions",
	observations: (sessionId) => `mem:obs:${sessionId}`,
	memories: "mem:memories",
	summaries: "mem:summaries",
	config: "mem:config",
	metrics: "mem:metrics",
	health: "mem:health",
	embeddings: (obsId) => `mem:emb:${obsId}`,
	bm25Index: "mem:index:bm25",
	relations: "mem:relations",
	profiles: "mem:profiles",
	claudeBridge: "mem:claude-bridge",
	graphNodes: "mem:graph:nodes",
	graphEdges: "mem:graph:edges",
	semantic: "mem:semantic",
	procedural: "mem:procedural",
	teamShared: (teamId) => `mem:team:${teamId}:shared`,
	teamUsers: (teamId, userId) => `mem:team:${teamId}:users:${userId}`,
	teamProfile: (teamId) => `mem:team:${teamId}:profile`,
	audit: "mem:audit",
	actions: "mem:actions",
	actionEdges: "mem:action-edges",
	leases: "mem:leases",
	routines: "mem:routines",
	routineRuns: "mem:routine-runs",
	signals: "mem:signals",
	checkpoints: "mem:checkpoints",
	mesh: "mem:mesh",
	sketches: "mem:sketches",
	facets: "mem:facets",
	sentinels: "mem:sentinels",
	crystals: "mem:crystals"
};

//#endregion
//#region src/state/keyed-mutex.ts
const locks = /* @__PURE__ */ new Map();
function withKeyedLock(key, fn) {
	const next = (locks.get(key) ?? Promise.resolve()).then(fn, fn);
	const cleanup = next.then(() => {}, () => {});
	locks.set(key, cleanup);
	cleanup.then(() => {
		if (locks.get(key) === cleanup) locks.delete(key);
	});
	return next;
}

//#endregion
//#region src/functions/diagnostics.ts
const ALL_CATEGORIES = [
	"actions",
	"leases",
	"sentinels",
	"sketches",
	"signals",
	"sessions",
	"memories",
	"mesh"
];
const TWENTY_FOUR_HOURS_MS = 1440 * 60 * 1e3;
const ONE_HOUR_MS = 3600 * 1e3;
function registerDiagnosticsFunction(sdk, kv) {
	sdk.registerFunction({ id: "mem::diagnose" }, async (data) => {
		const categories = data.categories && data.categories.length > 0 ? data.categories.filter((c) => ALL_CATEGORIES.includes(c)) : ALL_CATEGORIES;
		const checks = [];
		const now = Date.now();
		if (categories.includes("actions")) {
			const actions = await kv.list(KV.actions);
			const allEdges = await kv.list(KV.actionEdges);
			const leases = await kv.list(KV.leases);
			const actionMap = new Map(actions.map((a) => [a.id, a]));
			for (const action of actions) {
				if (action.status === "active") {
					if (!leases.some((l) => l.actionId === action.id && l.status === "active" && new Date(l.expiresAt).getTime() > now)) checks.push({
						name: `active-no-lease:${action.id}`,
						category: "actions",
						status: "warn",
						message: `Action "${action.title}" is active but has no active lease`,
						fixable: false
					});
				}
				if (action.status === "blocked") {
					const deps = allEdges.filter((e) => e.sourceActionId === action.id && e.type === "requires");
					if (deps.length > 0) {
						if (deps.every((d) => {
							const target = actionMap.get(d.targetActionId);
							return target && target.status === "done";
						})) checks.push({
							name: `blocked-deps-done:${action.id}`,
							category: "actions",
							status: "fail",
							message: `Action "${action.title}" is blocked but all dependencies are done`,
							fixable: true
						});
					}
				}
				if (action.status === "pending") {
					const deps = allEdges.filter((e) => e.sourceActionId === action.id && e.type === "requires");
					if (deps.length > 0) {
						if (deps.some((d) => {
							const target = actionMap.get(d.targetActionId);
							return !target || target.status !== "done";
						})) checks.push({
							name: `pending-unsatisfied-deps:${action.id}`,
							category: "actions",
							status: "fail",
							message: `Action "${action.title}" is pending but has unsatisfied dependencies`,
							fixable: true
						});
					}
				}
			}
			if (!checks.some((c) => c.category === "actions" && c.status !== "pass")) checks.push({
				name: "actions-ok",
				category: "actions",
				status: "pass",
				message: `All ${actions.length} actions are consistent`,
				fixable: false
			});
		}
		if (categories.includes("leases")) {
			const leases = await kv.list(KV.leases);
			const actions = await kv.list(KV.actions);
			const actionIds = new Set(actions.map((a) => a.id));
			let leaseIssues = 0;
			for (const lease of leases) {
				if (lease.status === "active" && new Date(lease.expiresAt).getTime() <= now) {
					checks.push({
						name: `expired-lease:${lease.id}`,
						category: "leases",
						status: "fail",
						message: `Lease ${lease.id} for action ${lease.actionId} expired at ${lease.expiresAt}`,
						fixable: true
					});
					leaseIssues++;
				}
				if (!actionIds.has(lease.actionId)) {
					checks.push({
						name: `orphaned-lease:${lease.id}`,
						category: "leases",
						status: "fail",
						message: `Lease ${lease.id} references non-existent action ${lease.actionId}`,
						fixable: true
					});
					leaseIssues++;
				}
			}
			if (leaseIssues === 0) checks.push({
				name: "leases-ok",
				category: "leases",
				status: "pass",
				message: `All ${leases.length} leases are healthy`,
				fixable: false
			});
		}
		if (categories.includes("sentinels")) {
			const sentinels = await kv.list(KV.sentinels);
			const actions = await kv.list(KV.actions);
			const actionIds = new Set(actions.map((a) => a.id));
			let sentinelIssues = 0;
			for (const sentinel of sentinels) {
				if (sentinel.status === "watching" && sentinel.expiresAt && new Date(sentinel.expiresAt).getTime() <= now) {
					checks.push({
						name: `expired-sentinel:${sentinel.id}`,
						category: "sentinels",
						status: "fail",
						message: `Sentinel "${sentinel.name}" expired at ${sentinel.expiresAt}`,
						fixable: true
					});
					sentinelIssues++;
				}
				for (const actionId of sentinel.linkedActionIds) if (!actionIds.has(actionId)) {
					checks.push({
						name: `sentinel-missing-action:${sentinel.id}:${actionId}`,
						category: "sentinels",
						status: "warn",
						message: `Sentinel "${sentinel.name}" references non-existent action ${actionId}`,
						fixable: false
					});
					sentinelIssues++;
				}
			}
			if (sentinelIssues === 0) checks.push({
				name: "sentinels-ok",
				category: "sentinels",
				status: "pass",
				message: `All ${sentinels.length} sentinels are healthy`,
				fixable: false
			});
		}
		if (categories.includes("sketches")) {
			const sketches = await kv.list(KV.sketches);
			let sketchIssues = 0;
			for (const sketch of sketches) if (sketch.status === "active" && new Date(sketch.expiresAt).getTime() <= now) {
				checks.push({
					name: `expired-sketch:${sketch.id}`,
					category: "sketches",
					status: "fail",
					message: `Sketch "${sketch.title}" expired at ${sketch.expiresAt}`,
					fixable: true
				});
				sketchIssues++;
			}
			if (sketchIssues === 0) checks.push({
				name: "sketches-ok",
				category: "sketches",
				status: "pass",
				message: `All ${sketches.length} sketches are healthy`,
				fixable: false
			});
		}
		if (categories.includes("signals")) {
			const signals = await kv.list(KV.signals);
			let signalIssues = 0;
			for (const signal of signals) if (signal.expiresAt && new Date(signal.expiresAt).getTime() <= now) {
				checks.push({
					name: `expired-signal:${signal.id}`,
					category: "signals",
					status: "fail",
					message: `Signal from "${signal.from}" expired at ${signal.expiresAt}`,
					fixable: true
				});
				signalIssues++;
			}
			if (signalIssues === 0) checks.push({
				name: "signals-ok",
				category: "signals",
				status: "pass",
				message: `All ${signals.length} signals are healthy`,
				fixable: false
			});
		}
		if (categories.includes("sessions")) {
			const sessions = await kv.list(KV.sessions);
			let sessionIssues = 0;
			for (const session of sessions) if (session.status === "active" && now - new Date(session.startedAt).getTime() > TWENTY_FOUR_HOURS_MS) {
				checks.push({
					name: `abandoned-session:${session.id}`,
					category: "sessions",
					status: "warn",
					message: `Session ${session.id} has been active for over 24 hours`,
					fixable: false
				});
				sessionIssues++;
			}
			if (sessionIssues === 0) checks.push({
				name: "sessions-ok",
				category: "sessions",
				status: "pass",
				message: `All ${sessions.length} sessions are healthy`,
				fixable: false
			});
		}
		if (categories.includes("memories")) {
			const memories = await kv.list(KV.memories);
			const memoryIds = new Set(memories.map((m) => m.id));
			const supersededBy = /* @__PURE__ */ new Map();
			let memoryIssues = 0;
			for (const memory of memories) if (memory.supersedes && memory.supersedes.length > 0) for (const sid of memory.supersedes) {
				if (!memoryIds.has(sid)) {
					checks.push({
						name: `memory-missing-supersedes:${memory.id}:${sid}`,
						category: "memories",
						status: "warn",
						message: `Memory "${memory.title}" supersedes non-existent memory ${sid}`,
						fixable: false
					});
					memoryIssues++;
				}
				supersededBy.set(sid, memory.id);
			}
			for (const memory of memories) if (memory.isLatest && supersededBy.has(memory.id)) {
				checks.push({
					name: `memory-stale-latest:${memory.id}`,
					category: "memories",
					status: "fail",
					message: `Memory "${memory.title}" has isLatest=true but is superseded by ${supersededBy.get(memory.id)}`,
					fixable: true
				});
				memoryIssues++;
			}
			if (memoryIssues === 0) checks.push({
				name: "memories-ok",
				category: "memories",
				status: "pass",
				message: `All ${memories.length} memories are consistent`,
				fixable: false
			});
		}
		if (categories.includes("mesh")) {
			const peers = await kv.list(KV.mesh);
			let meshIssues = 0;
			for (const peer of peers) {
				if (peer.lastSyncAt && now - new Date(peer.lastSyncAt).getTime() > ONE_HOUR_MS) {
					checks.push({
						name: `stale-peer:${peer.id}`,
						category: "mesh",
						status: "warn",
						message: `Peer "${peer.name}" last synced over 1 hour ago`,
						fixable: false
					});
					meshIssues++;
				}
				if (peer.status === "error") {
					checks.push({
						name: `error-peer:${peer.id}`,
						category: "mesh",
						status: "warn",
						message: `Peer "${peer.name}" is in error state`,
						fixable: false
					});
					meshIssues++;
				}
			}
			if (meshIssues === 0) checks.push({
				name: "mesh-ok",
				category: "mesh",
				status: "pass",
				message: `All ${peers.length} mesh peers are healthy`,
				fixable: false
			});
		}
		return {
			success: true,
			checks,
			summary: {
				pass: checks.filter((c) => c.status === "pass").length,
				warn: checks.filter((c) => c.status === "warn").length,
				fail: checks.filter((c) => c.status === "fail").length,
				fixable: checks.filter((c) => c.fixable).length
			}
		};
	});
	sdk.registerFunction({ id: "mem::heal" }, async (data) => {
		const dryRun = data.dryRun ?? false;
		const categories = data.categories && data.categories.length > 0 ? data.categories.filter((c) => ALL_CATEGORIES.includes(c)) : ALL_CATEGORIES;
		let fixed = 0;
		let skipped = 0;
		const details = [];
		const now = Date.now();
		if (categories.includes("actions")) {
			const actions = await kv.list(KV.actions);
			const allEdges = await kv.list(KV.actionEdges);
			const actionMap = new Map(actions.map((a) => [a.id, a]));
			for (const action of actions) {
				if (action.status === "blocked") {
					const deps = allEdges.filter((e) => e.sourceActionId === action.id && e.type === "requires");
					if (deps.length > 0) {
						if (deps.every((d) => {
							const target = actionMap.get(d.targetActionId);
							return target && target.status === "done";
						})) {
							if (dryRun) {
								details.push(`[dry-run] Would unblock action "${action.title}" (${action.id})`);
								fixed++;
								continue;
							}
							if (await withKeyedLock(`mem:action:${action.id}`, async () => {
								const fresh = await kv.get(KV.actions, action.id);
								if (!fresh || fresh.status !== "blocked") return false;
								const freshDeps = (await kv.list(KV.actionEdges)).filter((e) => e.sourceActionId === fresh.id && e.type === "requires");
								const freshActions = await kv.list(KV.actions);
								const freshMap = new Map(freshActions.map((a) => [a.id, a]));
								if (!freshDeps.every((d) => {
									const target = freshMap.get(d.targetActionId);
									return target && target.status === "done";
								})) return false;
								fresh.status = "pending";
								fresh.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
								await kv.set(KV.actions, fresh.id, fresh);
								return true;
							})) {
								details.push(`Unblocked action "${action.title}" (${action.id})`);
								fixed++;
							} else skipped++;
						}
					}
				}
				if (action.status === "pending") {
					const deps = allEdges.filter((e) => e.sourceActionId === action.id && e.type === "requires");
					if (deps.length > 0) {
						if (deps.some((d) => {
							const target = actionMap.get(d.targetActionId);
							return !target || target.status !== "done";
						})) {
							if (dryRun) {
								details.push(`[dry-run] Would block action "${action.title}" (${action.id})`);
								fixed++;
								continue;
							}
							if (await withKeyedLock(`mem:action:${action.id}`, async () => {
								const fresh = await kv.get(KV.actions, action.id);
								if (!fresh || fresh.status !== "pending") return false;
								const freshDeps = (await kv.list(KV.actionEdges)).filter((e) => e.sourceActionId === fresh.id && e.type === "requires");
								const freshActions = await kv.list(KV.actions);
								const freshMap = new Map(freshActions.map((a) => [a.id, a]));
								if (!freshDeps.some((d) => {
									const target = freshMap.get(d.targetActionId);
									return !target || target.status !== "done";
								})) return false;
								fresh.status = "blocked";
								fresh.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
								await kv.set(KV.actions, fresh.id, fresh);
								return true;
							})) {
								details.push(`Blocked action "${action.title}" (${action.id})`);
								fixed++;
							} else skipped++;
						}
					}
				}
			}
		}
		if (categories.includes("leases")) {
			const leases = await kv.list(KV.leases);
			const actions = await kv.list(KV.actions);
			const actionIds = new Set(actions.map((a) => a.id));
			for (const lease of leases) {
				if (lease.status === "active" && new Date(lease.expiresAt).getTime() <= now) {
					if (dryRun) {
						details.push(`[dry-run] Would expire lease ${lease.id} for action ${lease.actionId}`);
						fixed++;
						continue;
					}
					if (await withKeyedLock(`mem:action:${lease.actionId}`, async () => {
						const fresh = await kv.get(KV.leases, lease.id);
						if (!fresh || fresh.status !== "active" || new Date(fresh.expiresAt).getTime() > Date.now()) return false;
						fresh.status = "expired";
						await kv.set(KV.leases, fresh.id, fresh);
						const action = await kv.get(KV.actions, fresh.actionId);
						if (action && action.status === "active" && action.assignedTo === fresh.agentId) {
							action.status = "pending";
							action.assignedTo = void 0;
							action.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
							await kv.set(KV.actions, action.id, action);
						}
						return true;
					})) {
						details.push(`Expired lease ${lease.id} for action ${lease.actionId}`);
						fixed++;
					} else skipped++;
					continue;
				}
				if (!actionIds.has(lease.actionId)) {
					if (dryRun) {
						details.push(`[dry-run] Would delete orphaned lease ${lease.id}`);
						fixed++;
						continue;
					}
					await kv.delete(KV.leases, lease.id);
					details.push(`Deleted orphaned lease ${lease.id}`);
					fixed++;
				}
			}
		}
		if (categories.includes("sentinels")) {
			const sentinels = await kv.list(KV.sentinels);
			for (const sentinel of sentinels) if (sentinel.status === "watching" && sentinel.expiresAt && new Date(sentinel.expiresAt).getTime() <= now) {
				if (dryRun) {
					details.push(`[dry-run] Would expire sentinel "${sentinel.name}" (${sentinel.id})`);
					fixed++;
					continue;
				}
				if (await withKeyedLock(`mem:sentinel:${sentinel.id}`, async () => {
					const fresh = await kv.get(KV.sentinels, sentinel.id);
					if (!fresh || fresh.status !== "watching") return false;
					if (!fresh.expiresAt || new Date(fresh.expiresAt).getTime() > Date.now()) return false;
					fresh.status = "expired";
					await kv.set(KV.sentinels, fresh.id, fresh);
					return true;
				})) {
					details.push(`Expired sentinel "${sentinel.name}" (${sentinel.id})`);
					fixed++;
				} else skipped++;
			}
		}
		if (categories.includes("sketches")) {
			const sketches = await kv.list(KV.sketches);
			for (const sketch of sketches) if (sketch.status === "active" && new Date(sketch.expiresAt).getTime() <= now) {
				if (dryRun) {
					details.push(`[dry-run] Would discard expired sketch "${sketch.title}" (${sketch.id})`);
					fixed++;
					continue;
				}
				if (await withKeyedLock(`mem:sketch:${sketch.id}`, async () => {
					const fresh = await kv.get(KV.sketches, sketch.id);
					if (!fresh || fresh.status !== "active" || new Date(fresh.expiresAt).getTime() > Date.now()) return false;
					const allEdges = await kv.list(KV.actionEdges);
					const actionIdSet = new Set(fresh.actionIds);
					for (const edge of allEdges) if (actionIdSet.has(edge.sourceActionId) || actionIdSet.has(edge.targetActionId)) await kv.delete(KV.actionEdges, edge.id);
					for (const actionId of fresh.actionIds) await kv.delete(KV.actions, actionId);
					fresh.status = "discarded";
					fresh.discardedAt = (/* @__PURE__ */ new Date()).toISOString();
					await kv.set(KV.sketches, fresh.id, fresh);
					return true;
				})) {
					details.push(`Discarded expired sketch "${sketch.title}" (${sketch.id})`);
					fixed++;
				} else skipped++;
			}
		}
		if (categories.includes("signals")) {
			const signals = await kv.list(KV.signals);
			for (const signal of signals) if (signal.expiresAt && new Date(signal.expiresAt).getTime() <= now) {
				if (dryRun) {
					details.push(`[dry-run] Would delete expired signal ${signal.id}`);
					fixed++;
					continue;
				}
				await kv.delete(KV.signals, signal.id);
				details.push(`Deleted expired signal ${signal.id}`);
				fixed++;
			}
		}
		if (categories.includes("memories")) {
			const memories = await kv.list(KV.memories);
			const supersededBy = /* @__PURE__ */ new Map();
			for (const memory of memories) if (memory.supersedes && memory.supersedes.length > 0) for (const sid of memory.supersedes) supersededBy.set(sid, memory.id);
			for (const memory of memories) if (memory.isLatest && supersededBy.has(memory.id)) {
				if (dryRun) {
					details.push(`[dry-run] Would set isLatest=false on memory "${memory.title}" (${memory.id})`);
					fixed++;
					continue;
				}
				if (await withKeyedLock(`mem:memory:${memory.id}`, async () => {
					const fresh = await kv.get(KV.memories, memory.id);
					if (!fresh || !fresh.isLatest) return false;
					fresh.isLatest = false;
					fresh.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					await kv.set(KV.memories, fresh.id, fresh);
					return true;
				})) {
					details.push(`Set isLatest=false on memory "${memory.title}" (${memory.id})`);
					fixed++;
				} else skipped++;
			}
		}
		return {
			success: true,
			fixed,
			skipped,
			details
		};
	});
}

//#endregion
export { registerDiagnosticsFunction };
//# sourceMappingURL=diagnostics.mjs.map