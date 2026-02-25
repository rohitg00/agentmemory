import { defineConfig } from "tsdown";

const hookEntries = [
  "src/hooks/session-start.ts",
  "src/hooks/prompt-submit.ts",
  "src/hooks/post-tool-use.ts",
  "src/hooks/stop.ts",
  "src/hooks/session-end.ts",
];

export default defineConfig([
  {
    entry: ["src/index.ts"],
    outDir: "dist",
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "node18",
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: hookEntries,
    outDir: "dist/hooks",
    format: ["esm"],
    clean: false,
    sourcemap: false,
    target: "node18",
  },
  {
    entry: hookEntries,
    outDir: "plugin/scripts",
    format: ["esm"],
    clean: false,
    sourcemap: false,
    target: "node18",
  },
]);
