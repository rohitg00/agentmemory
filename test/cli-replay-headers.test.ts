import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

describe("CLI replay import caller headers", () => {
  let upstream: Server | undefined;
  let child: ChildProcess | undefined;

  afterEach(async () => {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
    }
    child = undefined;
    if (upstream) {
      await new Promise<void>((resolve) => upstream!.close(() => resolve()));
      upstream = undefined;
    }
  });

  it(
    "uses the shared JSON headers including caller identity",
    async () => {
      let replayHeaders: IncomingHttpHeaders | undefined;
      upstream = createServer((req, res) => {
        if (req.url === "/agentmemory/livez") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
          return;
        }
        if (
          req.url === "/agentmemory/replay/import-jsonl" &&
          req.method === "POST"
        ) {
          replayHeaders = req.headers;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              imported: 0,
              observations: 0,
              sessionIds: [],
            }),
          );
          return;
        }
        res.writeHead(404).end();
      });
      upstream.listen(0);
      await new Promise<void>((resolve) =>
        upstream!.once("listening", () => resolve()),
      );
      const port = (upstream.address() as AddressInfo).port;

      child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli.ts",
          "import-jsonl",
          "--port",
          String(port),
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            AGENTMEMORY_URL: "",
            AGENTMEMORY_SECRET: "api-secret",
            AGENT_ID: "cli-agent",
            AGENTMEMORY_CALLER_TOKEN: "cli-caller-secret",
            FORCE_COLOR: "0",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child!.once("error", reject);
        child!.once("exit", resolve);
      });

      expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
      expect(replayHeaders?.authorization).toBe("Bearer api-secret");
      expect(replayHeaders?.["x-agentmemory-agent-id"]).toBe("cli-agent");
      expect(replayHeaders?.["x-agentmemory-caller-token"]).toBe(
        "cli-caller-secret",
      );
      expect(replayHeaders?.["content-type"]).toBe("application/json");
    },
    15_000,
  );
});
