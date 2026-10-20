import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cli = process.env.AGENTMEMORY_TEST_CODEX || "codex";
const root = realpathSync(
  mkdtempSync(join(tmpdir(), "agentmemory codex native ")),
);
const work = join(root, "project");
mkdirSync(work);
mkdirSync(join(root, ".codex"));
writeFileSync(join(work, "sample.txt"), "codex synthetic capture verification");
const requests = [],
  models = [];
const context = "SYNTHETIC_CODEX_CONTEXT";
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
          : { context, accepted: true },
      ),
    );
  }
  models.push(body);
  const done = models.length > 1;
  const item = done
    ? {
        id: "msg_synthetic",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: "Synthetic test completed.",
            annotations: [],
          },
        ],
      }
    : {
        id: "fc_synthetic",
        type: "function_call",
        call_id: "call_synthetic",
        name: "exec_command",
        arguments: JSON.stringify({
          cmd: "cat sample.txt",
          max_output_tokens: 100,
        }),
      };
  res.setHeader("content-type", "text/event-stream");
  const emit = (type, data) =>
    res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  emit("response.created", {
    response: {
      id: "resp_synthetic",
      object: "response",
      status: "in_progress",
      output: [],
    },
  });
  emit("response.output_item.added", {
    output_index: 0,
    item: done ? { ...item, content: [] } : { ...item, arguments: "" },
  });
  if (done)
    emit("response.output_text.delta", {
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      delta: "Synthetic test completed.",
    });
  emit("response.output_item.done", { output_index: 0, item });
  emit("response.completed", {
    response: {
      id: "resp_synthetic",
      object: "response",
      status: "completed",
      output: [item],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    },
  });
  res.end();
});
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    ["PATH", "TMPDIR", "TEMP", "SYSTEMROOT", "LANG"].includes(k),
  ),
);
Object.assign(env, {
  HOME: root,
  USERPROFILE: root,
  CODEX_HOME: join(root, ".codex"),
  AGENTMEMORY_INJECT_CONTEXT: "true",
  AGENTMEMORY_DATA_DIR: join(root, "capture"),
});
try {
  await new Promise((r, j) =>
    server.once("error", j).listen(0, "127.0.0.1", r),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  env.AGENTMEMORY_URL = base;
  console.log(
    execFileSync(cli, ["--version"], { env, encoding: "utf8" }).trim(),
  );
  execFileSync(
    cli,
    ["plugin", "marketplace", "add", join(repo, "dist/plugins"), "--json"],
    { env, cwd: work, encoding: "utf8", timeout: 30_000 },
  );
  execFileSync(
    cli,
    ["plugin", "add", "agentmemory@agentmemory-local-preview", "--json"],
    { env, cwd: work, encoding: "utf8", timeout: 30_000 },
  );
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--dangerously-bypass-hook-trust",
    "--json",
    "--sandbox",
    "read-only",
    "-C",
    work,
    "-c",
    'model="synthetic"',
    "-c",
    'model_provider="synthetic"',
    "-c",
    `model_providers.synthetic={name="Synthetic local test",base_url="${base}/v1",wire_api="responses",requires_openai_auth=false}`,
    "-c",
    "features.hooks=true",
    "Read sample.txt using exec_command.",
  ];
  const child = spawn(cli, args, {
    env,
    cwd: work,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "",
    err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  const t = setTimeout(() => child.kill("SIGTERM"), 45000);
  const code = await new Promise((r, j) => {
    child.on("exit", r);
    child.on("error", j);
  });
  clearTimeout(t);
  assert.equal(code, 0, err);
  assert.equal(models.length, 2);
  assert.ok(out.includes("Synthetic test completed."));
  assert.ok(
    JSON.stringify(models[1]).includes("codex synthetic capture verification"),
    "native file read must reach the model",
  );
  assert.ok(JSON.stringify(models).includes(context));
  assert.ok(requests.some((r) => r.path === "/agentmemory/session/start"));
  assert.ok(requests.some((r) => r.body.hookType === "prompt_submit"));
  assert.ok(
    requests.some(
      (r) =>
        r.body.hookType === "post_tool_use" &&
        r.body.data.tool_output.includes(
          "codex synthetic capture verification",
        ),
    ),
  );
  assert.ok(requests.some((r) => r.path === "/agentmemory/mcp/tools"));
  const session = requests.find((r) => r.path === "/agentmemory/session/start")
    .body.sessionId;
  assert.ok(
    requests
      .filter((r) => r.body.hookType)
      .every((r) => r.body.sessionId === session),
  );
  assert.equal(
    requests.filter((r) => r.path === "/agentmemory/session/end").length,
    1,
  );
  console.log(
    "PASS: native Codex plugin install, bundled MCP, context injection, prompt/tool capture, and session end. Synthetic model and capture server only.",
  );
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(root, { recursive: true, force: true });
}
