import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { promises as fs } from "node:fs";
import { basename } from "node:path";
import { KV } from "../state/schema.js";
import type { Outline, OutlineNode } from "../types.js";

const ATX_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^(```|~~~)/;

interface RawHeading {
  level: number;
  title: string;
  line: number;
}

export function parseHeadings(content: string): RawHeading[] {
  const lines = content.split("\n");
  const out: RawHeading[] = [];
  let inFence = false;
  let fenceMarker = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (line.trimStart().startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (inFence) continue;

    const m = line.match(ATX_RE);
    if (!m) continue;
    out.push({
      level: m[1].length,
      title: m[2].trim(),
      line: i + 1,
    });
  }
  return out;
}

export function buildOutline(
  content: string,
  artifact_id: string,
  source_mtime: string,
  source_size: number,
): Outline {
  const lines = content.split("\n");
  const lineCount = lines.length;
  const headings = parseHeadings(content);

  const nodes: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  const counters: number[] = [];

  for (let idx = 0; idx < headings.length; idx++) {
    const h = headings[idx];
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }

    while (counters.length < h.level) counters.push(0);
    counters.length = h.level;
    counters[h.level - 1]++;

    const node_id = counters.join(".");

    let line_end = lineCount;
    for (let j = idx + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) {
        line_end = headings[j].line - 1;
        break;
      }
    }

    const node: OutlineNode = {
      node_id,
      title: h.title,
      level: h.level,
      line_start: h.line,
      line_end,
      children: [],
    };

    if (stack.length === 0) {
      nodes.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  const title = deriveTitle(headings, artifact_id);

  return {
    artifact_id,
    title,
    generated_at: new Date().toISOString(),
    source_mtime,
    source_size,
    nodes,
  };
}

function deriveTitle(headings: RawHeading[], artifact_id: string): string {
  const firstH1 = headings.find((h) => h.level === 1);
  if (firstH1) return firstH1.title;
  if (headings.length > 0) return headings[0].title;
  return basename(artifact_id);
}

export function findNode(
  nodes: OutlineNode[],
  node_id: string,
): OutlineNode | null {
  for (const n of nodes) {
    if (n.node_id === node_id) return n;
    const child = findNode(n.children, node_id);
    if (child) return child;
  }
  return null;
}

export function registerOutlineFunctions(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::outline-build" },
    async (data: { path: string; artifact_id?: string }) => {
      if (!data.path || typeof data.path !== "string") {
        return { success: false, error: "path is required" };
      }
      let stat;
      let content: string;
      try {
        stat = await fs.stat(data.path);
        content = await fs.readFile(data.path, "utf-8");
      } catch (err) {
        return { success: false, error: `read failed: ${String(err)}` };
      }

      const artifact_id = data.artifact_id || data.path;
      const outline = buildOutline(
        content,
        artifact_id,
        stat.mtime.toISOString(),
        stat.size,
      );

      await kv.set(KV.outlines, artifact_id, outline);

      return {
        success: true,
        artifact_id,
        title: outline.title,
        nodeCount: countNodes(outline.nodes),
        rootCount: outline.nodes.length,
      };
    },
  );

  sdk.registerFunction(
    { id: "mem::outline-get" },
    async (data: { artifact_id: string }) => {
      if (!data.artifact_id || typeof data.artifact_id !== "string") {
        return { success: false, error: "artifact_id is required" };
      }
      const outline = await kv.get<Outline>(KV.outlines, data.artifact_id);
      if (!outline) {
        return {
          success: false,
          error: "outline not built, call memory_build_outline first",
        };
      }
      return { success: true, outline };
    },
  );

  sdk.registerFunction(
    { id: "mem::outline-section" },
    async (data: { artifact_id: string; node_id: string }) => {
      if (!data.artifact_id || typeof data.artifact_id !== "string") {
        return { success: false, error: "artifact_id is required" };
      }
      if (!data.node_id || typeof data.node_id !== "string") {
        return { success: false, error: "node_id is required" };
      }

      const outline = await kv.get<Outline>(KV.outlines, data.artifact_id);
      if (!outline) {
        return {
          success: false,
          error: "outline not built, call memory_build_outline first",
        };
      }

      const node = findNode(outline.nodes, data.node_id);
      if (!node) {
        return { success: false, error: `node not found: ${data.node_id}` };
      }

      let stat;
      let content: string;
      try {
        stat = await fs.stat(data.artifact_id);
        content = await fs.readFile(data.artifact_id, "utf-8");
      } catch (err) {
        return {
          success: false,
          error: `outline stale, rebuild needed: ${String(err)}`,
        };
      }

      if (
        stat.mtime.toISOString() !== outline.source_mtime ||
        stat.size !== outline.source_size
      ) {
        return {
          success: false,
          error: "outline stale, rebuild needed",
          stale: true,
        };
      }

      const lines = content.split("\n");
      const slice = lines.slice(node.line_start - 1, node.line_end);
      const text = slice.join("\n");

      return {
        success: true,
        node,
        text,
        line_count: slice.length,
      };
    },
  );
}

function countNodes(nodes: OutlineNode[]): number {
  let n = nodes.length;
  for (const c of nodes) n += countNodes(c.children);
  return n;
}
