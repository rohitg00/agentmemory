import { defineConfig } from "tsdown";

const hookEntries = [
  "src/hooks/session-start.ts",
  "src/hooks/prompt-submit.ts",
  "src/hooks/pre-tool-use.ts",
  "src/hooks/post-tool-use.ts",
  "src/hooks/post-tool-failure.ts",
  "src/hooks/pre-compact.ts",
  "src/hooks/subagent-start.ts",
  "src/hooks/subagent-stop.ts",
  "src/hooks/notification.ts",
  "src/hooks/task-completed.ts",
  "src/hooks/stop.ts",
  "src/hooks/session-end.ts",
];

const shared = {
  format: ["esm"] as const,
  target: "node20" as const,
  inlineOnly: false as const,
  // Keep as node_modules imports. We never import onnxruntime-{node,web}
  // directly; they come in transitively through @xenova/transformers, which
  // is lazy-loaded from src/providers/embedding/{clip,local}.ts and
  // src/state/reranker.ts. Bundling inlines relative paths like
  // `../bin/napi-v3/darwin/arm64/onnxruntime_binding.node` that no longer
  // resolve from dist/. All three are declared as optionalDependencies in
  // package.json so users can install them only when they enable local
  // embeddings / CLIP / reranker.
  external: [
    "@xenova/transformers",
    "onnxruntime-node",
    "onnxruntime-web",
    "@anthropic-ai/claude-agent-sdk",
    "@anthropic-ai/sdk",
  ] as const,
};

export default defineConfig([
  {
    entry: ["src/index.ts"],
    outDir: "dist",
    ...shared,
    dts: true,
    clean: true,
    sourcemap: true,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: ["src/cli.ts"],
    outDir: "dist",
    ...shared,
    clean: false,
    sourcemap: false,
  },
  {
    entry: ["src/mcp/standalone.ts"],
    outDir: "dist",
    ...shared,
    clean: false,
    sourcemap: false,
  },
  {
    entry: hookEntries,
    outDir: "dist/hooks",
    ...shared,
    clean: false,
    sourcemap: false,
  },
  {
    entry: hookEntries,
    outDir: "plugin/scripts",
    ...shared,
    clean: false,
    sourcemap: false,
  },
]);
