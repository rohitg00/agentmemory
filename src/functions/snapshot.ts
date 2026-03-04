import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SnapshotMeta, Session, Memory, GraphNode } from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";
import { VERSION } from "../version.js";

const COMMIT_HASH_RE = /^[0-9a-f]{7,40}$/i;

const execFileAsync = promisify(execFile);

async function gitExec(dir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: dir });
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
  sdk: ISdk,
  kv: StateKV,
  snapshotDir: string,
): void {
  sdk.registerFunction(
    { id: "mem::snapshot-create" },
    async (data?: { message?: string }) => {
      const ctx = getContext();

      try {
        await ensureGitRepo(snapshotDir);

        const sessions = await kv.list<Session>(KV.sessions);
        const memories = await kv.list<Memory>(KV.memories);
        const graphNodes = await kv.list<GraphNode>(KV.graphNodes);

        const observations: Record<string, unknown[]> = {};
        for (const session of sessions) {
          const obs = await kv
            .list(KV.observations(session.id))
            .catch(() => []);
          if (obs.length > 0) {
            observations[session.id] = obs;
          }
        }

        const state = {
          version: VERSION,
          timestamp: new Date().toISOString(),
          sessions,
          memories,
          graphNodes,
          observations,
        };

        writeFileSync(
          join(snapshotDir, "state.json"),
          JSON.stringify(state, null, 2),
          "utf-8",
        );

        await gitExec(snapshotDir, ["add", "."]);

        const message = data?.message || `Snapshot ${new Date().toISOString()}`;
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
          createdAt: new Date().toISOString(),
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

        ctx.logger.info("Snapshot created", { commitHash });
        return { success: true, snapshot: meta };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.logger.error("Snapshot failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );

  sdk.registerFunction({ id: "mem::snapshot-list" }, async () => {
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

  sdk.registerFunction(
    { id: "mem::snapshot-restore" },
    async (data: { commitHash: string }) => {
      const ctx = getContext();
      if (!data.commitHash) {
        return { success: false, error: "commitHash is required" };
      }
      if (!COMMIT_HASH_RE.test(data.commitHash)) {
        return { success: false, error: "Invalid commitHash format" };
      }

      try {
        await gitExec(snapshotDir, [
          "checkout",
          data.commitHash,
          "--",
          "state.json",
        ]);
        const content = readFileSync(join(snapshotDir, "state.json"), "utf-8");
        const state = JSON.parse(content) as {
          sessions?: Array<{ id: string } & Record<string, unknown>>;
          memories?: Array<{ id: string } & Record<string, unknown>>;
          graphNodes?: Array<{ id: string } & Record<string, unknown>>;
          observations?: Record<
            string,
            Array<{ id: string } & Record<string, unknown>>
          >;
        };

        if (state.sessions) {
          for (const session of state.sessions) {
            await kv.set(KV.sessions, session.id, session);
          }
        }
        if (state.memories) {
          for (const memory of state.memories) {
            await kv.set(KV.memories, memory.id, memory);
          }
        }
        if (state.graphNodes) {
          for (const node of state.graphNodes) {
            await kv.set(KV.graphNodes, node.id, node);
          }
        }
        if (state.observations) {
          for (const [sessionId, obs] of Object.entries(state.observations)) {
            for (const o of obs) {
              await kv.set(KV.observations(sessionId), o.id, o);
            }
          }
        }

        await gitExec(snapshotDir, ["checkout", "HEAD", "--", "state.json"]);

        await recordAudit(kv, "import", "mem::snapshot-restore", [], {
          commitHash: data.commitHash,
          sessions: state.sessions?.length || 0,
          memories: state.memories?.length || 0,
          graphNodes: state.graphNodes?.length || 0,
        });

        ctx.logger.info("Snapshot restored", {
          commitHash: data.commitHash,
        });
        return { success: true, commitHash: data.commitHash };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.logger.error("Snapshot restore failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );
}
