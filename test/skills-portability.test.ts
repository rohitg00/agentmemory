import { describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { getAllTools } from "../src/mcp/tools-registry.js";

const skills = resolve("plugin/skills");
const names = readdirSync(skills).filter((name) => existsSync(join(skills, name, "SKILL.md")));

describe("individually installed skills", () => {
  it("keeps referenced recovery documents inside each copied skill", () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-skills-"));
    try {
      const errors: string[] = [];
      for (const name of names) {
        const installed = join(root, name);
        cpSync(join(skills, name), installed, { recursive: true });
        const text = readFileSync(join(installed, "SKILL.md"), "utf8");
        for (const [reference] of text.matchAll(/[\w./-]*TROUBLESHOOTING\.md/g)) {
          const target = resolve(installed, reference);
          if (!target.startsWith(installed + sep) || !existsSync(target)) errors.push(`${name}: ${reference}`);
        }
      }
      expect(errors).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("documents only available tools and schema-compatible example arguments", () => {
    const tools = new Map(getAllTools().map((tool) => [tool.name, tool]));
    const errors: string[] = [];
    for (const name of names) {
      for (const file of ["SKILL.md", "EXAMPLES.md"]) {
        const path = join(skills, name, file);
        if (!existsSync(path)) continue;
        const text = readFileSync(path, "utf8");
        for (const [toolName] of text.matchAll(/\bmemory_[a-z_]+\b/g)) {
          if (!tools.has(toolName)) errors.push(`${name}/${file}: unknown tool ${toolName}`);
        }
        for (const [, toolName, json] of text.matchAll(/\b(memory_[a-z_]+)\s+(\{[^{}]*\})/g)) {
          const tool = tools.get(toolName);
          if (!tool) continue;
          let args: Record<string, unknown>;
          try { args = JSON.parse(json); } catch { continue; }
          for (const [key, value] of Object.entries(args)) {
            const schema = tool.inputSchema.properties?.[key];
            if (!schema) errors.push(`${name}/${file}: ${toolName}.${key} is not advertised`);
            else if (schema.type === "string" && typeof value !== "string") errors.push(`${name}/${file}: ${toolName}.${key} must be a string`);
          }
        }
      }
    }
    expect(errors).toEqual([]);
  });
});
