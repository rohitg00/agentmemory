import { pinGraphState } from "../state/graph-generation.js";
import type { IIIClient } from "iii-sdk";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  SnapshotMeta,
  Session,
  Memory,
  GraphNode,
  GraphEdge,
  CompressedObservation,
  AccessLogExport,
} from "../types.js";
import { KV, generateId, UNSESSIONED_OBSERVATION_SCOPE } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { collectAll } from "../state/kv.js";
import type { SearchIndexRevision } from "../state/search-index.js";
import { addSessionToProjectIndex } from "../state/session-index.js";
import { indexObservationSession } from "../state/obs-index.js";
import { memoryImagePaths, observationImagePaths, withImageRefBatch, type ImageRefReservation } from "./image-refs.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { recordAudit } from "./audit.js";
import { persistGraphRecords, validateGraphRecords } from "../state/graph-ingestion.js";
import { flushIndexSave, getSearchIndex, indexRecords, vectorIndexRemove } from "./search.js";
import { VERSION } from "../version.js";
import { logger } from "../logger.js";
const COMMIT_HASH_RE = /^[0-9a-f]{7,40}$/i;

const execFileAsync = promisify(execFile);

async function gitExec(dir: string, args: string[], maxBuffer?: number): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: dir, maxBuffer });
  return stdout.trim();
}

async function ensureGitRepo(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(join(dir, ".git"))) {
    await gitExec(dir, ["init"]);
    await gitExec(dir, ["config", "user.email", "agentmemory@local"]);
    await gitExec(dir, ["config", "user.name", "agentmemory"]);
  }
}

export function registerSnapshotFunction(
  sdk: IIIClient,
  state: StateKV,
  snapshotDir: string,
): void {
  // Serialize snapshots: the periodic timer, REST (api::snapshot-create), and
  // MCP can all trigger this concurrently. Two runs writing state.json and
  // committing in the same git repo at once race on the index lock. An
  // overlapping call is a no-op success; the winner captures current state.
  let snapshotInFlight = false;

  sdk.registerFunction("mem::snapshot-create",
    async (data?: { message?: string }) => {
      const kv = await pinGraphState(state);
      if (snapshotInFlight) {
        return { success: true, message: "Snapshot already in progress" };
      }
      snapshotInFlight = true;

      try {
        await ensureGitRepo(snapshotDir);
        const ts = new Date().toISOString();

        const sessions = await kv.list<Session>(KV.sessions);
        const memories = await collectAll<Memory>(kv, KV.memories);
        const graphNodes = await collectAll<GraphNode>(kv, KV.graphNodes);
        const graphEdges = await collectAll<GraphEdge>(kv, KV.graphEdges);
        const accessLogs = await kv
          .list<AccessLogExport>(KV.accessLog)
          .catch(() => [] as AccessLogExport[]);

        const observations: Record<string, unknown[]> = {};
        for (const session of sessions) {
          const obs = await kv
            .list(KV.observations(session.id))
            .catch(() => []);
          if (obs.length > 0) {
            observations[session.id] = obs;
          }
        }
        const migratedObs = await kv
          .list(KV.observations(UNSESSIONED_OBSERVATION_SCOPE))
          .catch(() => []);
        if (migratedObs.length > 0) {
          observations[UNSESSIONED_OBSERVATION_SCOPE] = migratedObs;
        }

        const state = {
          version: VERSION,
          timestamp: ts,
          sessions,
          memories,
          graphNodes,
          graphEdges,
          observations,
          accessLogs,
        };

        writeFileSync(
          join(snapshotDir, "state.json"),
          JSON.stringify(state, null, 2),
          "utf-8",
        );

        await gitExec(snapshotDir, ["add", "."]);

        const message = data?.message || `Snapshot ${ts}`;
        try {
          await gitExec(snapshotDir, ["commit", "-m", message]);
        } catch (commitErr) {
          const errMsg =
            commitErr instanceof Error ? commitErr.message : String(commitErr);
          if (errMsg.includes("nothing to commit")) {
            return { success: true, message: "No changes to snapshot" };
          }
          throw commitErr;
        }

        const commitHash = await gitExec(snapshotDir, ["rev-parse", "HEAD"]);

        const meta: SnapshotMeta = {
          id: generateId("snap"),
          commitHash,
          createdAt: ts,
          message,
          stats: {
            sessions: sessions.length,
            observations: Object.values(observations).reduce(
              (sum, arr) => sum + arr.length,
              0,
            ),
            memories: memories.length,
            graphNodes: graphNodes.length,
          },
        };

        await recordAudit(kv, "export", "mem::snapshot-create", [meta.id], {
          commitHash,
          stats: meta.stats,
        });

        logger.info("Snapshot created", { commitHash });
        return { success: true, snapshot: meta };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Snapshot failed", { error: msg });
        return { success: false, error: msg };
      } finally {
        snapshotInFlight = false;
      }
    },
  );

  sdk.registerFunction("mem::snapshot-list",  async () => {
    try {
      if (!existsSync(join(snapshotDir, ".git"))) {
        return { snapshots: [] };
      }
      const log = await gitExec(snapshotDir, [
        "log",
        "--format=%H|%aI|%s",
        "-20",
      ]);
      const snapshots = log
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const parts = line.split("|");
          const [hash, date] = parts;
          const msg = parts.slice(2).join("|");
          return { commitHash: hash, createdAt: date, message: msg };
        });
      return { snapshots };
    } catch {
      return { snapshots: [] };
    }
  });

  sdk.registerFunction("mem::snapshot-restore", 
    async (data: { commitHash: string } | undefined) => {
      const kv = await pinGraphState(state);
      if (!data || typeof data.commitHash !== "string" || !data.commitHash.trim()) {
        return { success: false, error: "commitHash is required" };
      }
      if (!COMMIT_HASH_RE.test(data.commitHash)) {
        return { success: false, error: "Invalid commitHash format" };
      }

      try {
        const content = await gitExec(snapshotDir, ["show", `${data.commitHash}:state.json`], Infinity);
        const archive = JSON.parse(content) as {
          sessions?: Array<{ id: string } & Record<string, unknown>>;
          memories?: Memory[];
          graphNodes?: GraphNode[];
          graphEdges?: GraphEdge[];
          observations?: Record<string, CompressedObservation[]>;
          accessLogs?: AccessLogExport[];
        };
        validateGraphRecords(archive.graphNodes ?? [], archive.graphEdges ?? []);
        const memoryIds = new Set<string>();
        const observationSessions = new Map<string, string>();
        let restoreError: unknown;
        try {
          const restoreMemories: Array<{
            row: Memory;
            token: ImageRefReservation;
          }> = [];
          const restoreObservations = new Map<
            string,
            Array<{ row: CompressedObservation; token: ImageRefReservation }>
          >();
          await withImageRefBatch(kv, sdk, async (batch) => {
            const archiveMemories = archive.memories ?? [];
            const memoryTokens = await batch.reserveAll(archiveMemories.map(memoryImagePaths));
            for (let i = 0; i < archiveMemories.length; i++) {
              restoreMemories.push({ row: archiveMemories[i], token: memoryTokens[i] });
            }
            for (const [sessionId, observations] of Object.entries(archive.observations ?? {})) {
              const tokens = await batch.reserveAll(observations.map(observationImagePaths));
              restoreObservations.set(
                sessionId,
                observations.map((row, i) => ({ row, token: tokens[i] })),
              );
            }
            if (archive.sessions) {
              for (const session of archive.sessions) {
                await withKeyedLock(`obs:${session.id}`, () =>
                  kv.set(KV.sessions, session.id, session),
                );
                const project = session.project;
                const startedAt = session.startedAt;
                if (typeof project === "string" && typeof startedAt === "string") {
                  const agentId = session.agentId;
                  await addSessionToProjectIndex(kv, project, {
                    id: session.id,
                    startedAt,
                    ...(typeof agentId === "string" ? { agentId } : {}),
                  }).catch(() => {});
                }
              }
            }
            for (const { row: memory, token } of restoreMemories) {
              await withKeyedLock(`mem:${memory.id}`, async () => {
                const previous = await kv.get<Memory>(KV.memories, memory.id);
                await kv.set(KV.memories, memory.id, memory);
                batch.written(token, memoryImagePaths(previous));
                getSearchIndex().remove(memory.id);
                vectorIndexRemove(memory.id);
                memoryIds.add(memory.id);
              });
            }
            for (const [sessionId, rows] of restoreObservations) {
              await withKeyedLock(`obs:${sessionId}`, async () => {
                for (const { row: observation, token } of rows) {
                  const previous = await kv.get<CompressedObservation>(KV.observations(sessionId), observation.id);
                  await kv.set(KV.observations(sessionId), observation.id, observation);
                  batch.written(token, observationImagePaths(previous));
                  getSearchIndex().remove(observation.id);
                  vectorIndexRemove(observation.id);
                  observationSessions.set(observation.id, sessionId);
                  await indexObservationSession(kv, observation.id, sessionId);
                }
              });
            }
            if (archive.graphNodes?.length || archive.graphEdges?.length) {
              await persistGraphRecords(kv, archive.graphNodes ?? [], archive.graphEdges ?? [], { mode: "merge" });
            }
            for (const log of archive.accessLogs ?? []) {
              await kv.set(KV.accessLog, log.memoryId, log);
            }
          });
        } catch (err) {
          restoreError = err;
        }

        let indexError: unknown;
        if (memoryIds.size || observationSessions.size) {
          const revisions: SearchIndexRevision[] = [];
          try {
            const memories: Array<{ record: Memory; revision: SearchIndexRevision }> = [];
            const observations: Array<{ record: CompressedObservation; revision: SearchIndexRevision }> = [];
            for (const id of memoryIds) {
              const revision = getSearchIndex().watchRevision(id);
              revisions.push(revision);
              const current = await kv.get<Memory>(KV.memories, id);
              if (current) memories.push({ record: current, revision });
            }
            for (const [id, sessionId] of observationSessions) {
              const revision = getSearchIndex().watchRevision(id);
              revisions.push(revision);
              const current = await kv.get<CompressedObservation>(KV.observations(sessionId), id);
              if (current) observations.push({ record: current, revision });
            }
            await indexRecords(
              observations.filter(({ revision }) => revision.isCurrent()).map(({ record }) => record),
              memories.filter(({ revision }) => revision.isCurrent()).map(({ record }) => record),
            );
          } catch (err) {
            indexError = err;
          } finally {
            for (const revision of revisions) revision.release();
            await flushIndexSave();
          }
        }
        if (restoreError) throw restoreError;
        if (indexError) throw indexError;

        await recordAudit(kv, "import", "mem::snapshot-restore", [], {
          commitHash: data.commitHash,
          sessions: archive.sessions?.length || 0,
          memories: archive.memories?.length || 0,
          graphNodes: archive.graphNodes?.length || 0,
        });

        logger.info("Snapshot restored", {
          commitHash: data.commitHash,
        });
        return { success: true, commitHash: data.commitHash };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Snapshot restore failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );
}
