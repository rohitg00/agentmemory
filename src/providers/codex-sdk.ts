import { spawn } from "node:child_process";

import type { MemoryProvider } from "../types.js";
import { getEnvVar } from "../config.js";

const DEFAULT_MODEL = "codex-default";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ERROR_CHARS = 4_000;

function parseTimeout(value: string | undefined): number {
  if (!value) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function truncate(value: string): string {
  const cleaned = stripAnsi(value).trim();
  if (cleaned.length <= MAX_ERROR_CHARS) return cleaned;
  return `${cleaned.slice(0, MAX_ERROR_CHARS)}...`;
}

function buildPrompt(systemPrompt: string, userPrompt: string, maxTokens: number): string {
  return [
    "You are agentmemory's Codex CLI compression worker.",
    "Do not use tools. Return only the requested memory output.",
    `Keep the response within approximately ${maxTokens} tokens.`,
    "",
    "<system>",
    systemPrompt,
    "</system>",
    "",
    "<user>",
    userPrompt,
    "</user>",
  ].join("\n");
}

/**
 * Opt-in Codex CLI subscription-auth fallback.
 *
 * This intentionally shells out through the supported `codex exec` CLI surface
 * instead of reading private Codex/ChatGPT token files. The child process is
 * marked with AGENTMEMORY_SDK_CHILD so agentmemory hooks short-circuit and do
 * not recursively capture/summarize the compression session.
 */
export class CodexSDKProvider implements MemoryProvider {
  name = "codex-sdk";

  constructor(
    private model = getEnvVar("AGENTMEMORY_CODEX_MODEL") || DEFAULT_MODEL,
    private maxTokens = 4_096,
    private command = getEnvVar("AGENTMEMORY_CODEX_COMMAND") || "codex",
    private timeoutMs = parseTimeout(
      getEnvVar("AGENTMEMORY_CODEX_TIMEOUT_MS") ||
        getEnvVar("AGENTMEMORY_LLM_TIMEOUT_MS"),
    ),
  ) {}

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.query(systemPrompt, userPrompt);
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.query(systemPrompt, userPrompt);
  }

  private async query(systemPrompt: string, userPrompt: string): Promise<string> {
    if (process.env.AGENTMEMORY_SDK_CHILD === "1") {
      return "";
    }

    const args = [
      "exec",
      "--ephemeral",
      "--ignore-rules",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
    ];
    if (this.model && this.model !== DEFAULT_MODEL) {
      args.push("--model", this.model);
    }
    args.push("-");

    const prompt = buildPrompt(systemPrompt, userPrompt, this.maxTokens);

    return await new Promise<string>((resolve, reject) => {
      let settled = false;
      let stdout = "";
      let stderr = "";
      let timer: NodeJS.Timeout;

      const child = spawn(this.command, args, {
        env: {
          ...process.env,
          AGENTMEMORY_SDK_CHILD: "1",
          AGENTMEMORY_CODEX_SDK_CHILD: "1",
          NO_COLOR: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const finish = (err: Error | null, value = "") => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(value);
      };

      timer = setTimeout(() => {
        child.kill("SIGTERM");
        finish(
          new Error(
            `Codex CLI request timed out after ${this.timeoutMs}ms — set AGENTMEMORY_CODEX_TIMEOUT_MS (or AGENTMEMORY_LLM_TIMEOUT_MS) to raise the bound.`,
          ),
        );
      }, this.timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.stdin.on("error", () => undefined);

      child.on("error", (err) => {
        finish(
          new Error(
            `Failed to launch Codex CLI (${this.command}): ${err.message}. Install Codex CLI and run codex login, or unset AGENTMEMORY_ALLOW_CODEX_SDK.`,
          ),
        );
      });

      child.on("close", (code, signal) => {
        if (code === 0) {
          finish(null, stripAnsi(stdout).trim());
          return;
        }
        const detail = truncate(stderr || stdout);
        finish(
          new Error(
            `Codex CLI exited with ${signal ? `signal ${signal}` : `code ${code}`}${
              detail ? `: ${detail}` : ""
            }`,
          ),
        );
      });

      child.stdin.end(prompt);
    });
  }
}
