import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cli = process.env.AGENTMEMORY_TEST_ANTIGRAVITY || "agy";
const root = realpathSync(
  mkdtempSync(join(tmpdir(), "agentmemory-agy-native-")),
);
const work = join(root, "project");
mkdirSync(work);
mkdirSync(join(root, ".gemini/antigravity-cli"), { recursive: true });
writeFileSync(
  join(work, "sample.txt"),
  "antigravity synthetic capture verification",
);
writeFileSync(
  join(root, ".gemini/antigravity-cli/settings.json"),
  JSON.stringify({ modelProvider: "gemini" }),
);
const requests = [],
  models = [];
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  if (req.url.startsWith("/agentmemory/")) {
    requests.push({ path: req.url, body });
    res.setHeader("content-type", "application/json");
    return res.end(
      JSON.stringify(
        req.url.endsWith("/mcp/tools")
          ? { tools: [] }
          : { context: "SYNTHETIC_AGY_CONTEXT", accepted: true },
      ),
    );
  }
  models.push({ path: req.url, body });
  const done = !body.tools || models.filter((m) => m.body.tools).length > 1;
  const part = done
    ? { text: "Synthetic test completed." }
    : {
        functionCall: {
          name: "view_file",
          args: {
            AbsolutePath: join(work, "sample.txt"),
            toolSummary: "Synthetic file check",
            toolAction: "Reading test file",
          },
        },
      };
  const response = {
    candidates: [
      {
        content: { role: "model", parts: [part] },
        finishReason: "STOP",
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 10,
      totalTokenCount: 20,
    },
  };
  if (req.url.includes("alt=sse")) {
    res.setHeader("content-type", "text/event-stream");
    res.end(`data: ${JSON.stringify(response)}\n\n`);
  } else {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(response));
  }
});
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    ["PATH", "TMPDIR", "TEMP", "SYSTEMROOT", "LANG"].includes(k),
  ),
);
Object.assign(env, {
  HOME: root,
  USERPROFILE: root,
  GEMINI_API_KEY: "synthetic-local-only",
  AGENTMEMORY_INJECT_CONTEXT: "true",
  AGENTMEMORY_DATA_DIR: join(root, "capture"),
});
try {
  await new Promise((r, j) =>
    server.once("error", j).listen(0, "127.0.0.1", r),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  env.AGENTMEMORY_URL = base;
  env.GOOGLE_GEMINI_BASE_URL = base;
  console.log(
    execFileSync(cli, ["--version"], {
      env,
      encoding: "utf8",
      timeout: 30_000,
    }).trim(),
  );
  execFileSync(
    process.execPath,
    [join(repo, "dist/cli.mjs"), "connect", "antigravity-cli", "--with-hooks"],
    { env, cwd: work, encoding: "utf8", timeout: 30_000 },
  );
  assert.match(
    execFileSync(cli, ["mcp", "list"], {
      env,
      cwd: work,
      encoding: "utf8",
      timeout: 30_000,
    }),
    /agentmemory.*npx -y @agentmemory\/mcp/,
  );
  // Keep the connector's environment settings, but exercise this unpublished build.
  writeFileSync(
    join(root, ".gemini/config/mcp_config.json"),
    JSON.stringify({
      mcpServers: {
        agentmemory: {
          command: process.execPath,
          args: [join(repo, "plugin/scripts/plugin-bridge.mjs")],
          env: JSON.parse(
            readFileSync(join(root, ".gemini/config/mcp_config.json"), "utf8"),
          ).mcpServers.agentmemory.env,
        },
      },
    }),
  );
  const child = spawn(
    cli,
    [
      "--print",
      "Read sample.txt using view_file.",
      "--output-format",
      "json",
      "--print-timeout",
      "20s",
      "--sandbox",
    ],
    { env, cwd: work, stdio: ["ignore", "pipe", "pipe"] },
  );
  let out = "",
    err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  const t = setTimeout(() => child.kill("SIGTERM"), 35000);
  const code = await new Promise((r, j) => {
    child.on("exit", r);
    child.on("error", j);
  });
  clearTimeout(t);
  assert.equal(code, 0, err);
  const result = JSON.parse(out);
  assert.equal(result.status, "SUCCESS");
  assert.match(result.response, /Synthetic test completed/);
  const turns = models.filter((m) => m.body.tools);
  assert.equal(turns.length, 2);
  assert.ok(
    JSON.stringify(turns[0]).includes("SYNTHETIC_AGY_CONTEXT"),
    "recalled context must reach the model",
  );
  assert.ok(
    JSON.stringify(turns[1]).includes(
      "antigravity synthetic capture verification",
    ),
    "native file read must reach the model",
  );
  assert.ok(
    requests.some((r) => r.path === "/agentmemory/mcp/tools"),
    "connector environment must reach the bundled MCP bridge",
  );
  assert.equal(
    requests.filter((r) => r.path === "/agentmemory/session/start").length,
    1,
  );
  assert.equal(
    requests.filter((r) => r.path === "/agentmemory/session/end").length,
    1,
  );
  const prompts = requests.filter((r) => r.body.hookType === "prompt_submit");
  assert.deepEqual(
    prompts.map((r) => r.body.data.prompt),
    ["Read sample.txt using view_file."],
  );
  const captures = requests.filter((r) => r.body.hookType === "post_tool_use");
  assert.equal(captures.length, 1);
  assert.equal(captures[0].body.data.tool_name, "read");
  assert.equal(
    captures[0].body.data.tool_input.file_path,
    join(work, "sample.txt"),
  );
  assert.ok(
    requests
      .filter((r) => r.body.hookType)
      .every((r) => r.body.sessionId === result.conversation_id),
  );
  console.log(
    "PASS: native Antigravity connector, bundled MCP, context injection, tool capture, transcript prompt backfill, and one session lifecycle. Synthetic model and capture server only.",
  );
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(root, { recursive: true, force: true });
}
