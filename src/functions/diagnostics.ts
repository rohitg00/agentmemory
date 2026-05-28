import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { recordAudit } from "./audit.js";
import type {
  Action,
  ActionEdge,
  DiagnosticCheck,
  Insight,
  Lease,
  Lesson,
  Checkpoint,
  Crystal,
  ProceduralMemory,
  SemanticMemory,
  SessionSummary,
  Signal,
  Sentinel,
  Sketch,
  MeshPeer,
  Session,
  Memory,
} from "../types.js";

const ALL_CATEGORIES = [
  "actions",
  "leases",
  "sentinels",
  "sketches",
  "signals",
  "sessions",
  "memories",
  "lessons",
  "summaries",
  "semantic",
  "procedural",
  "crystals",
  "insights",
  "mesh",
];

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export function registerDiagnosticsFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::diagnose", 
    async (data: { categories?: string[] }) => {
      const categories = data.categories && data.categories.length > 0
        ? data.categories.filter((c) => ALL_CATEGORIES.includes(c))
        : ALL_CATEGORIES;

      const checks: DiagnosticCheck[] = [];
      const now = Date.now();

      if (categories.includes("actions")) {
        const actions = await kv.list<Action>(KV.actions);
        const allEdges = await kv.list<ActionEdge>(KV.actionEdges);
        const leases = await kv.list<Lease>(KV.leases);
        const actionMap = new Map(actions.map((a) => [a.id, a]));

        for (const action of actions) {
          if (action.status === "active") {
            const hasActiveLease = leases.some(
              (l) =>
                l.actionId === action.id &&
                l.status === "active" &&
                new Date(l.expiresAt).getTime() > now,
            );
            if (!hasActiveLease) {
              checks.push({
                name: `active-no-lease:${action.id}`,
                category: "actions",
                status: "warn",
                message: `Action "${action.title}" is active but has no active lease`,
                fixable: false,
              });
            }
          }

          if (action.status === "blocked") {
            const deps = allEdges.filter(
              (e) => e.sourceActionId === action.id && e.type === "requires",
            );
            if (deps.length > 0) {
              const allDone = deps.every((d) => {
                const target = actionMap.get(d.targetActionId);
                return target && target.status === "done";
              });
              if (allDone) {
                checks.push({
                  name: `blocked-deps-done:${action.id}`,
                  category: "actions",
                  status: "fail",
                  message: `Action "${action.title}" is blocked but all dependencies are done`,
                  fixable: true,
                });
              }
            }
          }

          if (action.status === "pending") {
            const deps = allEdges.filter(
              (e) => e.sourceActionId === action.id && e.type === "requires",
            );
            if (deps.length > 0) {
              const hasUnsatisfied = deps.some((d) => {
                const target = actionMap.get(d.targetActionId);
                return !target || target.status !== "done";
              });
              if (hasUnsatisfied) {
                checks.push({
                  name: `pending-unsatisfied-deps:${action.id}`,
                  category: "actions",
                  status: "fail",
                  message: `Action "${action.title}" is pending but has unsatisfied dependencies`,
                  fixable: true,
                });
              }
            }
          }
        }

        if (
          !checks.some((c) => c.category === "actions" && c.status !== "pass")
        ) {
          checks.push({
            name: "actions-ok",
            category: "actions",
            status: "pass",
            message: `All ${actions.length} actions are consistent`,
            fixable: false,
          });
        }
      }

      if (categories.includes("leases")) {
        const leases = await kv.list<Lease>(KV.leases);
        const actions = await kv.list<Action>(KV.actions);
        const actionIds = new Set(actions.map((a) => a.id));
        let leaseIssues = 0;

        for (const lease of leases) {
          if (
            lease.status === "active" &&
            new Date(lease.expiresAt).getTime() <= now
          ) {
            checks.push({
              name: `expired-lease:${lease.id}`,
              category: "leases",
              status: "fail",
              message: `Lease ${lease.id} for action ${lease.actionId} expired at ${lease.expiresAt}`,
              fixable: true,
            });
            leaseIssues++;
          }

          if (!actionIds.has(lease.actionId)) {
            checks.push({
              name: `orphaned-lease:${lease.id}`,
              category: "leases",
              status: "fail",
              message: `Lease ${lease.id} references non-existent action ${lease.actionId}`,
              fixable: true,
            });
            leaseIssues++;
          }
        }

        if (leaseIssues === 0) {
          checks.push({
            name: "leases-ok",
            category: "leases",
            status: "pass",
            message: `All ${leases.length} leases are healthy`,
            fixable: false,
          });
        }
      }

      if (categories.includes("sentinels")) {
        const sentinels = await kv.list<Sentinel>(KV.sentinels);
        const actions = await kv.list<Action>(KV.actions);
        const actionIds = new Set(actions.map((a) => a.id));
        let sentinelIssues = 0;

        for (const sentinel of sentinels) {
          if (
            sentinel.status === "watching" &&
            sentinel.expiresAt &&
            new Date(sentinel.expiresAt).getTime() <= now
          ) {
            checks.push({
              name: `expired-sentinel:${sentinel.id}`,
              category: "sentinels",
              status: "fail",
              message: `Sentinel "${sentinel.name}" expired at ${sentinel.expiresAt}`,
              fixable: true,
            });
            sentinelIssues++;
          }

          for (const actionId of sentinel.linkedActionIds) {
            if (!actionIds.has(actionId)) {
              checks.push({
                name: `sentinel-missing-action:${sentinel.id}:${actionId}`,
                category: "sentinels",
                status: "warn",
                message: `Sentinel "${sentinel.name}" references non-existent action ${actionId}`,
                fixable: false,
              });
              sentinelIssues++;
            }
          }
        }

        if (sentinelIssues === 0) {
          checks.push({
            name: "sentinels-ok",
            category: "sentinels",
            status: "pass",
            message: `All ${sentinels.length} sentinels are healthy`,
            fixable: false,
          });
        }
      }

      if (categories.includes("sketches")) {
        const sketches = await kv.list<Sketch>(KV.sketches);
        let sketchIssues = 0;

        for (const sketch of sketches) {
          if (
            sketch.status === "active" &&
            new Date(sketch.expiresAt).getTime() <= now
          ) {
            checks.push({
              name: `expired-sketch:${sketch.id}`,
              category: "sketches",
              status: "fail",
              message: `Sketch "${sketch.title}" expired at ${sketch.expiresAt}`,
              fixable: true,
            });
            sketchIssues++;
          }
        }

        if (sketchIssues === 0) {
          checks.push({
            name: "sketches-ok",
            category: "sketches",
            status: "pass",
            message: `All ${sketches.length} sketches are healthy`,
            fixable: false,
          });
        }
      }

      if (categories.includes("signals")) {
        const signals = await kv.list<Signal>(KV.signals);
        let signalIssues = 0;

        for (const signal of signals) {
          if (
            signal.expiresAt &&
            new Date(signal.expiresAt).getTime() <= now
          ) {
            checks.push({
              name: `expired-signal:${signal.id}`,
              category: "signals",
              status: "fail",
              message: `Signal from "${signal.from}" expired at ${signal.expiresAt}`,
              fixable: true,
            });
            signalIssues++;
          }
        }

        if (signalIssues === 0) {
          checks.push({
            name: "signals-ok",
            category: "signals",
            status: "pass",
            message: `All ${signals.length} signals are healthy`,
            fixable: false,
          });
        }
      }

      if (categories.includes("sessions")) {
        const sessions = await kv.list<Session>(KV.sessions);
        let sessionIssues = 0;

        for (const session of sessions) {
          if (
            session.status === "active" &&
            now - new Date(session.startedAt).getTime() > TWENTY_FOUR_HOURS_MS
          ) {
            checks.push({
              name: `abandoned-session:${session.id}`,
              category: "sessions",
              status: "warn",
              message: `Session ${session.id} has been active for over 24 hours`,
              fixable: false,
            });
            sessionIssues++;
          }
        }

        if (sessionIssues === 0) {
          checks.push({
            name: "sessions-ok",
            category: "sessions",
            status: "pass",
            message: `All ${sessions.length} sessions are healthy`,
            fixable: false,
          });
        }
      }

      if (categories.includes("memories")) {
        const memories = await kv.list<Memory>(KV.memories);
        const memoryIds = new Set(memories.map((m) => m.id));
        const supersededBy = new Map<string, string>();
        let memoryIssues = 0;

        for (const memory of memories) {
          if (memory.supersedes && memory.supersedes.length > 0) {
            for (const sid of memory.supersedes) {
              if (!memoryIds.has(sid)) {
                checks.push({
                  name: `memory-missing-supersedes:${memory.id}:${sid}`,
                  category: "memories",
                  status: "warn",
                  message: `Memory "${memory.title}" supersedes non-existent memory ${sid}`,
                  fixable: false,
                });
                memoryIssues++;
              }
              supersededBy.set(sid, memory.id);
            }
          }
        }

        for (const memory of memories) {
          if (memory.isLatest && supersededBy.has(memory.id)) {
            checks.push({
              name: `memory-stale-latest:${memory.id}`,
              category: "memories",
              status: "fail",
              message: `Memory "${memory.title}" has isLatest=true but is superseded by ${supersededBy.get(memory.id)}`,
              fixable: true,
            });
            memoryIssues++;
          }
        }

        // Project-coverage check: unscoped memories (no project field) will
        // appear in every project's context and search results until the
        // infer-memory-projects migration runs. Surface a count so operators
        // know the backfill is still pending and can trigger it explicitly.
        const latestMemories = memories.filter((m) => m.isLatest);
        const unscopedCount = latestMemories.filter((m) => !m.project).length;
        if (unscopedCount === 0) {
          checks.push({
            name: "memory-project-coverage",
            category: "memories",
            status: "pass",
            message: `All ${latestMemories.length} latest memories have a project scope`,
            fixable: false,
          });
        } else if (unscopedCount <= 10) {
          checks.push({
            name: "memory-project-coverage",
            category: "memories",
            status: "warn",
            message: `${unscopedCount} of ${latestMemories.length} latest memories have no project scope — run POST /agentmemory/migrate {"step":"infer-memory-projects"} to backfill`,
            fixable: true,
          });
        } else {
          checks.push({
            name: "memory-project-coverage",
            category: "memories",
            status: "fail",
            message: `${unscopedCount} of ${latestMemories.length} latest memories have no project scope — run POST /agentmemory/migrate {"step":"infer-memory-projects"} to backfill`,
            fixable: true,
          });
        }

        if (memoryIssues === 0) {
          checks.push({
            name: "memories-ok",
            category: "memories",
            status: "pass",
            message: `All ${memories.length} memories are structurally consistent`,
            fixable: false,
          });
        }
      }

      if (categories.includes("lessons")) {
        // Counts only live lessons (deleted=true rows are tombstoned).
        // Catches bad confidence values that would silently break recall
        // scoring (memory_lesson_recall multiplies by confidence).
        const lessons = await kv.list<Lesson>(KV.lessons);
        const live = lessons.filter((l) => !l.deleted);
        let lessonIssues = 0;
        for (const l of live) {
          // Number.isFinite rejects NaN / Infinity / non-numbers; a
          // corrupted row passing those would silently survive the < / >
          // range check (e.g. NaN < 0 is false, NaN > 1 is false, so the
          // bad row would be "healthy") and skew memory_lesson_recall's
          // scoring downstream. Surface as warning.
          if (
            !Number.isFinite(l.confidence) ||
            l.confidence < 0 ||
            l.confidence > 1
          ) {
            checks.push({
              name: `lesson-bad-confidence:${l.id}`,
              category: "lessons",
              status: "warn",
              message: `Lesson ${l.id} has confidence ${l.confidence} (expected finite number in 0..1)`,
              fixable: false,
            });
            lessonIssues++;
          }
        }
        if (lessonIssues === 0) {
          checks.push({
            name: "lessons-ok",
            category: "lessons",
            status: "pass",
            message: `All ${live.length} lessons are healthy (${lessons.length - live.length} tombstoned)`,
            fixable: false,
          });
        }
      }

      if (categories.includes("summaries")) {
        const summaries = await kv.list<SessionSummary>(KV.summaries);
        let summaryIssues = 0;
        for (const s of summaries) {
          // typeof guard before .trim() — a corrupted row with title=null
          // or title=42 would otherwise throw and abort the whole diagnose
          // run before later categories get checked.
          if (typeof s.title !== "string" || s.title.trim().length === 0) {
            checks.push({
              name: `summary-missing-title:${s.sessionId}`,
              category: "summaries",
              status: "warn",
              message: `Summary for session ${s.sessionId} has no title`,
              fixable: false,
            });
            summaryIssues++;
          }
        }
        if (summaryIssues === 0) {
          checks.push({
            name: "summaries-ok",
            category: "summaries",
            status: "pass",
            message: `All ${summaries.length} session summaries are consistent`,
            fixable: false,
          });
        }
      }

      if (categories.includes("semantic")) {
        const semantic = await kv.list<SemanticMemory>(KV.semantic);
        let semanticIssues = 0;
        for (const s of semantic) {
          if (
            !Number.isFinite(s.confidence) ||
            s.confidence < 0 ||
            s.confidence > 1
          ) {
            checks.push({
              name: `semantic-bad-confidence:${s.id}`,
              category: "semantic",
              status: "warn",
              message: `Semantic fact ${s.id} has confidence ${s.confidence} (expected finite number in 0..1)`,
              fixable: false,
            });
            semanticIssues++;
          }
        }
        if (semanticIssues === 0) {
          checks.push({
            name: "semantic-ok",
            category: "semantic",
            status: "pass",
            message: `All ${semantic.length} semantic memories are consistent`,
            fixable: false,
          });
        }
      }

      if (categories.includes("procedural")) {
        const procedural = await kv.list<ProceduralMemory>(KV.procedural);
        let proceduralIssues = 0;
        for (const p of procedural) {
          if (!Array.isArray(p.steps) || p.steps.length === 0) {
            checks.push({
              name: `procedural-empty-steps:${p.id}`,
              category: "procedural",
              status: "warn",
              message: `Procedural memory "${p.name}" (${p.id}) has no steps`,
              fixable: false,
            });
            proceduralIssues++;
          }
        }
        if (proceduralIssues === 0) {
          checks.push({
            name: "procedural-ok",
            category: "procedural",
            status: "pass",
            message: `All ${procedural.length} procedural memories are consistent`,
            fixable: false,
          });
        }
      }

      if (categories.includes("crystals")) {
        const crystals = await kv.list<Crystal>(KV.crystals);
        let crystalIssues = 0;
        for (const c of crystals) {
          if (typeof c.narrative !== "string" || c.narrative.trim().length === 0) {
            checks.push({
              name: `crystal-empty-narrative:${c.id}`,
              category: "crystals",
              status: "warn",
              message: `Crystal ${c.id} has empty narrative`,
              fixable: false,
            });
            crystalIssues++;
          }
        }
        if (crystalIssues === 0) {
          checks.push({
            name: "crystals-ok",
            category: "crystals",
            status: "pass",
            message: `All ${crystals.length} crystals are consistent`,
            fixable: false,
          });
        }
      }

      if (categories.includes("insights")) {
        const insights = await kv.list<Insight>(KV.insights);
        let insightIssues = 0;
        for (const i of insights) {
          if (
            !Number.isFinite(i.confidence) ||
            i.confidence < 0 ||
            i.confidence > 1
          ) {
            checks.push({
              name: `insight-bad-confidence:${i.id}`,
              category: "insights",
              status: "warn",
              message: `Insight ${i.id} has confidence ${i.confidence} (expected finite number in 0..1)`,
              fixable: false,
            });
            insightIssues++;
          }
        }
        if (insightIssues === 0) {
          checks.push({
            name: "insights-ok",
            category: "insights",
            status: "pass",
            message: `All ${insights.length} insights are consistent`,
            fixable: false,
          });
        }
      }

      if (categories.includes("mesh")) {
        const peers = await kv.list<MeshPeer>(KV.mesh);
        let meshIssues = 0;

        for (const peer of peers) {
          if (
            peer.lastSyncAt &&
            now - new Date(peer.lastSyncAt).getTime() > ONE_HOUR_MS
          ) {
            checks.push({
              name: `stale-peer:${peer.id}`,
              category: "mesh",
              status: "warn",
              message: `Peer "${peer.name}" last synced over 1 hour ago`,
              fixable: false,
            });
            meshIssues++;
          }

          if (peer.status === "error") {
            checks.push({
              name: `error-peer:${peer.id}`,
              category: "mesh",
              status: "warn",
              message: `Peer "${peer.name}" is in error state`,
              fixable: false,
            });
            meshIssues++;
          }
        }

        if (meshIssues === 0) {
          checks.push({
            name: "mesh-ok",
            category: "mesh",
            status: "pass",
            message: `All ${peers.length} mesh peers are healthy`,
            fixable: false,
          });
        }
      }

      const summary = {
        pass: checks.filter((c) => c.status === "pass").length,
        warn: checks.filter((c) => c.status === "warn").length,
        fail: checks.filter((c) => c.status === "fail").length,
        fixable: checks.filter((c) => c.fixable).length,
      };

      return { success: true, checks, summary };
    },
  );

  sdk.registerFunction("mem::heal", 
    async (data: { categories?: string[]; dryRun?: boolean }) => {
      const dryRun = data.dryRun ?? false;
      const categories = data.categories && data.categories.length > 0
        ? data.categories.filter((c) => ALL_CATEGORIES.includes(c))
        : ALL_CATEGORIES;

      let fixed = 0;
      let skipped = 0;
      const details: string[] = [];
      const now = Date.now();

      if (categories.includes("actions")) {
        const actions = await kv.list<Action>(KV.actions);
        const allEdges = await kv.list<ActionEdge>(KV.actionEdges);
        const actionMap = new Map(actions.map((a) => [a.id, a]));

        for (const action of actions) {
          if (action.status === "blocked") {
            const deps = allEdges.filter(
              (e) => e.sourceActionId === action.id && e.type === "requires",
            );
            if (deps.length > 0) {
              const allDone = deps.every((d) => {
                const target = actionMap.get(d.targetActionId);
                return target && target.status === "done";
              });
              if (allDone) {
                if (dryRun) {
                  details.push(
                    `[dry-run] Would unblock action "${action.title}" (${action.id})`,
                  );
                  fixed++;
                  continue;
                }
                const didFix = await withKeyedLock(
                  `mem:action:${action.id}`,
                  async () => {
                    const fresh = await kv.get<Action>(KV.actions, action.id);
                    if (!fresh || fresh.status !== "blocked") return false;
                    const freshEdges = await kv.list<ActionEdge>(KV.actionEdges);
                    const freshDeps = freshEdges.filter(
                      (e) =>
                        e.sourceActionId === fresh.id && e.type === "requires",
                    );
                    const freshActions = await kv.list<Action>(KV.actions);
                    const freshMap = new Map(
                      freshActions.map((a) => [a.id, a]),
                    );
                    const stillAllDone = freshDeps.every((d) => {
                      const target = freshMap.get(d.targetActionId);
                      return target && target.status === "done";
                    });
                    if (!stillAllDone) return false;
                    fresh.status = "pending";
                    fresh.updatedAt = new Date().toISOString();
                    await kv.set(KV.actions, fresh.id, fresh);
                    await recordAudit(kv, "heal", "mem::heal", [fresh.id], {
                      reason: "blocked-deps-done",
                      previousStatus: "blocked",
                      newStatus: "pending",
                    });
                    return true;
                  },
                );
                if (didFix) {
                  details.push(
                    `Unblocked action "${action.title}" (${action.id})`,
                  );
                  fixed++;
                } else {
                  skipped++;
                }
              }
            }
          }

          if (action.status === "pending") {
            const deps = allEdges.filter(
              (e) => e.sourceActionId === action.id && e.type === "requires",
            );
            if (deps.length > 0) {
              const hasUnsatisfied = deps.some((d) => {
                const target = actionMap.get(d.targetActionId);
                return !target || target.status !== "done";
              });
              if (hasUnsatisfied) {
                if (dryRun) {
                  details.push(
                    `[dry-run] Would block action "${action.title}" (${action.id})`,
                  );
                  fixed++;
                  continue;
                }
                const didFix = await withKeyedLock(
                  `mem:action:${action.id}`,
                  async () => {
                    const fresh = await kv.get<Action>(KV.actions, action.id);
                    if (!fresh || fresh.status !== "pending") return false;
                    const freshEdges = await kv.list<ActionEdge>(KV.actionEdges);
                    const freshDeps = freshEdges.filter(
                      (e) =>
                        e.sourceActionId === fresh.id && e.type === "requires",
                    );
                    const freshActions = await kv.list<Action>(KV.actions);
                    const freshMap = new Map(
                      freshActions.map((a) => [a.id, a]),
                    );
                    const stillUnsatisfied = freshDeps.some((d) => {
                      const target = freshMap.get(d.targetActionId);
                      return !target || target.status !== "done";
                    });
                    if (!stillUnsatisfied) return false;
                    fresh.status = "blocked";
                    fresh.updatedAt = new Date().toISOString();
                    await kv.set(KV.actions, fresh.id, fresh);
                    await recordAudit(kv, "heal", "mem::heal", [fresh.id], {
                      reason: "pending-unsatisfied-deps",
                      previousStatus: "pending",
                      newStatus: "blocked",
                    });
                    return true;
                  },
                );
                if (didFix) {
                  details.push(
                    `Blocked action "${action.title}" (${action.id})`,
                  );
                  fixed++;
                } else {
                  skipped++;
                }
              }
            }
          }
        }
      }

      if (categories.includes("leases")) {
        const leases = await kv.list<Lease>(KV.leases);
        const actions = await kv.list<Action>(KV.actions);
        const actionIds = new Set(actions.map((a) => a.id));

        for (const lease of leases) {
          if (
            lease.status === "active" &&
            new Date(lease.expiresAt).getTime() <= now
          ) {
            if (dryRun) {
              details.push(
                `[dry-run] Would expire lease ${lease.id} for action ${lease.actionId}`,
              );
              fixed++;
              continue;
            }
            const didFix = await withKeyedLock(
              `mem:action:${lease.actionId}`,
              async () => {
                const fresh = await kv.get<Lease>(KV.leases, lease.id);
                if (
                  !fresh ||
                  fresh.status !== "active" ||
                  new Date(fresh.expiresAt).getTime() > Date.now()
                ) {
                  return false;
                }
                fresh.status = "expired";
                await kv.set(KV.leases, fresh.id, fresh);
                await recordAudit(kv, "heal", "mem::heal", [fresh.id], {
                  entityType: "lease",
                  reason: "expired-lease",
                  newStatus: "expired",
                });

                const action = await kv.get<Action>(KV.actions, fresh.actionId);
                if (
                  action &&
                  action.status === "active" &&
                  action.assignedTo === fresh.agentId
                ) {
                  action.status = "pending";
                  action.assignedTo = undefined;
                  action.updatedAt = new Date().toISOString();
                  await kv.set(KV.actions, action.id, action);
                  await recordAudit(kv, "heal", "mem::heal", [action.id], {
                    entityType: "action",
                    reason: "release-expired-lease",
                    newStatus: "pending",
                  });
                }
                return true;
              },
            );
            if (didFix) {
              details.push(
                `Expired lease ${lease.id} for action ${lease.actionId}`,
              );
              fixed++;
            } else {
              skipped++;
            }
            continue;
          }

          if (!actionIds.has(lease.actionId)) {
            if (dryRun) {
              details.push(
                `[dry-run] Would delete orphaned lease ${lease.id}`,
              );
              fixed++;
              continue;
            }
            await kv.delete(KV.leases, lease.id);
            await recordAudit(kv, "heal", "mem::heal", [lease.id], {
              entityType: "lease",
              reason: "orphaned-lease",
              action: "delete",
            });
            details.push(`Deleted orphaned lease ${lease.id}`);
            fixed++;
          }
        }
      }

      if (categories.includes("sentinels")) {
        const sentinels = await kv.list<Sentinel>(KV.sentinels);

        for (const sentinel of sentinels) {
          if (
            sentinel.status === "watching" &&
            sentinel.expiresAt &&
            new Date(sentinel.expiresAt).getTime() <= now
          ) {
            if (dryRun) {
              details.push(
                `[dry-run] Would expire sentinel "${sentinel.name}" (${sentinel.id})`,
              );
              fixed++;
              continue;
            }
            const didFix = await withKeyedLock(
              `mem:sentinel:${sentinel.id}`,
              async () => {
                const fresh = await kv.get<Sentinel>(
                  KV.sentinels,
                  sentinel.id,
                );
                if (!fresh || fresh.status !== "watching") return false;
                if (
                  !fresh.expiresAt ||
                  new Date(fresh.expiresAt).getTime() > Date.now()
                ) {
                  return false;
                }
                fresh.status = "expired";
                await kv.set(KV.sentinels, fresh.id, fresh);
                await recordAudit(kv, "heal", "mem::heal", [fresh.id], {
                  entityType: "sentinel",
                  reason: "expired-sentinel",
                  newStatus: "expired",
                });
                return true;
              },
            );
            if (didFix) {
              details.push(
                `Expired sentinel "${sentinel.name}" (${sentinel.id})`,
              );
              fixed++;
            } else {
              skipped++;
            }
          }
        }
      }

      if (categories.includes("sketches")) {
        const sketches = await kv.list<Sketch>(KV.sketches);

        for (const sketch of sketches) {
          if (
            sketch.status === "active" &&
            new Date(sketch.expiresAt).getTime() <= now
          ) {
            if (dryRun) {
              details.push(
                `[dry-run] Would discard expired sketch "${sketch.title}" (${sketch.id})`,
              );
              fixed++;
              continue;
            }
            const didFix = await withKeyedLock(
              `mem:sketch:${sketch.id}`,
              async () => {
                const fresh = await kv.get<Sketch>(KV.sketches, sketch.id);
                if (
                  !fresh ||
                  fresh.status !== "active" ||
                  new Date(fresh.expiresAt).getTime() > Date.now()
                ) {
                  return false;
                }

                const allEdges = await kv.list<ActionEdge>(KV.actionEdges);
                const actionIdSet = new Set(fresh.actionIds);
                for (const edge of allEdges) {
                  if (
                    actionIdSet.has(edge.sourceActionId) ||
                    actionIdSet.has(edge.targetActionId)
                  ) {
                    await kv.delete(KV.actionEdges, edge.id);
                    await recordAudit(kv, "heal", "mem::heal", [edge.id], {
                      entityType: "actionEdge",
                      reason: "sketch-gc-discard",
                      action: "delete",
                    });
                  }
                }
                for (const actionId of fresh.actionIds) {
                  await kv.delete(KV.actions, actionId);
                  await recordAudit(kv, "heal", "mem::heal", [actionId], {
                    entityType: "action",
                    reason: "sketch-gc-discard",
                    action: "delete",
                  });
                }

                fresh.status = "discarded";
                fresh.discardedAt = new Date().toISOString();
                await kv.set(KV.sketches, fresh.id, fresh);
                await recordAudit(kv, "heal", "mem::heal", [fresh.id], {
                  entityType: "sketch",
                  reason: "expired-sketch",
                  newStatus: "discarded",
                });
                return true;
              },
            );
            if (didFix) {
              details.push(
                `Discarded expired sketch "${sketch.title}" (${sketch.id})`,
              );
              fixed++;
            } else {
              skipped++;
            }
          }
        }
      }

      if (categories.includes("signals")) {
        const signals = await kv.list<Signal>(KV.signals);

        for (const signal of signals) {
          if (
            signal.expiresAt &&
            new Date(signal.expiresAt).getTime() <= now
          ) {
            if (dryRun) {
              details.push(
                `[dry-run] Would delete expired signal ${signal.id}`,
              );
              fixed++;
              continue;
            }
            await kv.delete(KV.signals, signal.id);
            await recordAudit(kv, "heal", "mem::heal", [signal.id], {
              entityType: "signal",
              reason: "expired-signal",
              action: "delete",
            });
            details.push(`Deleted expired signal ${signal.id}`);
            fixed++;
          }
        }
      }

      if (categories.includes("memories")) {
        const memories = await kv.list<Memory>(KV.memories);
        const supersededBy = new Map<string, string>();

        for (const memory of memories) {
          if (memory.supersedes && memory.supersedes.length > 0) {
            for (const sid of memory.supersedes) {
              supersededBy.set(sid, memory.id);
            }
          }
        }

        for (const memory of memories) {
          if (memory.isLatest && supersededBy.has(memory.id)) {
            if (dryRun) {
              details.push(
                `[dry-run] Would set isLatest=false on memory "${memory.title}" (${memory.id})`,
              );
              fixed++;
              continue;
            }
            const didFix = await withKeyedLock(
              `mem:memory:${memory.id}`,
              async () => {
                const fresh = await kv.get<Memory>(KV.memories, memory.id);
                if (!fresh || !fresh.isLatest) return false;
                fresh.isLatest = false;
                fresh.updatedAt = new Date().toISOString();
                await kv.set(KV.memories, fresh.id, fresh);
                await recordAudit(kv, "heal", "mem::heal", [fresh.id], {
                  entityType: "memory",
                  reason: "superseded-memory-mark-non-latest",
                  action: "update",
                });
                return true;
              },
            );
            if (didFix) {
              details.push(
                `Set isLatest=false on memory "${memory.title}" (${memory.id})`,
              );
              fixed++;
            } else {
              skipped++;
            }
          }
        }
      }

      return { success: true, fixed, skipped, details };
    },
  );
}
