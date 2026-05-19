import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type { Session } from "../types.js";
import { execFile } from "node:child_process";
import { detectGitProject } from "./project-identity.js";

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
  sdk.registerFunction("mem::detect-worktree", 
    async (data: { cwd: string }) => {
      if (!data.cwd) {
        return { success: false, error: "cwd is required" };
      }

      try {
        const git = await detectGitProject(data.cwd);
        if (!git) {
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

        return {
          success: true,
          ...git,
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

  sdk.registerFunction("mem::list-worktrees", 
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

  sdk.registerFunction("mem::branch-sessions", 
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
      >({ function_id: "mem::detect-worktree", payload: { cwd: data.cwd } });

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
