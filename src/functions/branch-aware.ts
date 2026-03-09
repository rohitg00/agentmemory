import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type { Session } from "../types.js";
import { execFile } from "node:child_process";
import { resolve } from "node:path";

function execAsync(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout: 5000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

export function registerBranchAwareFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::detect-worktree" },
    async (data: { cwd: string }) => {
      if (!data.cwd) {
        return { success: false, error: "cwd is required" };
      }

      try {
        const gitDir = await execAsync(
          "git",
          ["rev-parse", "--git-dir"],
          data.cwd,
        );
        const commonDir = await execAsync(
          "git",
          ["rev-parse", "--git-common-dir"],
          data.cwd,
        );
        const branch = await execAsync(
          "git",
          ["rev-parse", "--abbrev-ref", "HEAD"],
          data.cwd,
        ).catch(() => "detached");

        const topLevel = await execAsync(
          "git",
          ["rev-parse", "--show-toplevel"],
          data.cwd,
        );

        const isWorktree = resolve(data.cwd, gitDir) !== resolve(data.cwd, commonDir);
        const mainRepoRoot = isWorktree
          ? resolve(data.cwd, commonDir, "..")
          : topLevel;

        return {
          success: true,
          isWorktree,
          branch,
          topLevel,
          mainRepoRoot,
          gitDir: resolve(data.cwd, gitDir),
          commonDir: resolve(data.cwd, commonDir),
        };
      } catch {
        return {
          success: true,
          isWorktree: false,
          branch: null,
          topLevel: data.cwd,
          mainRepoRoot: data.cwd,
          gitDir: null,
          commonDir: null,
        };
      }
    },
  );

  sdk.registerFunction(
    { id: "mem::list-worktrees" },
    async (data: { cwd: string }) => {
      if (!data.cwd) {
        return { success: false, error: "cwd is required" };
      }

      try {
        const output = await execAsync(
          "git",
          ["worktree", "list", "--porcelain"],
          data.cwd,
        );

        const worktrees: Array<{
          path: string;
          head: string;
          branch: string;
          bare: boolean;
        }> = [];

        const blocks = output.split("\n\n").filter(Boolean);
        for (const block of blocks) {
          const lines = block.split("\n");
          const wt: { path: string; head: string; branch: string; bare: boolean } = {
            path: "",
            head: "",
            branch: "",
            bare: false,
          };
          for (const line of lines) {
            if (line.startsWith("worktree ")) wt.path = line.slice(9);
            else if (line.startsWith("HEAD ")) wt.head = line.slice(5);
            else if (line.startsWith("branch "))
              wt.branch = line.slice(7).replace("refs/heads/", "");
            else if (line === "bare") wt.bare = true;
          }
          if (wt.path) worktrees.push(wt);
        }

        return { success: true, worktrees };
      } catch {
        return { success: true, worktrees: [] };
      }
    },
  );

  sdk.registerFunction(
    { id: "mem::branch-sessions" },
    async (data: { cwd: string; branch?: string }) => {
      if (!data.cwd) {
        return { success: false, error: "cwd is required" };
      }

      const worktreeInfo = await sdk.trigger<
        { cwd: string },
        {
          success: boolean;
          isWorktree: boolean;
          mainRepoRoot: string;
          branch: string | null;
        }
      >("mem::detect-worktree", { cwd: data.cwd });

      const projectRoot = worktreeInfo.mainRepoRoot || data.cwd;
      const branch = data.branch || worktreeInfo.branch;

      const sessions = await kv.list<Session>(KV.sessions);

      const matching = sessions.filter((s) => {
        if (s.project === projectRoot || s.cwd === projectRoot) return true;
        if (s.cwd.startsWith(projectRoot + "/")) return true;
        return false;
      });

      matching.sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );

      return {
        success: true,
        sessions: matching,
        projectRoot,
        branch,
        isWorktree: worktreeInfo.isWorktree,
      };
    },
  );
}
