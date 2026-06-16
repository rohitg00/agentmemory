# PR 622 Copilot MCP Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the useful part of PR 622 into current README documentation for VS Code Copilot MCP users.

**Architecture:** This is a docs-only change. The existing Copilot CLI adapter and plugin config remain unchanged; README gains a manual VS Code Copilot entry because VS Code uses a different MCP JSON shape.

**Tech Stack:** Markdown documentation, JSON MCP config examples, existing TypeScript config constants as evidence.

---

### Task 1: Update Current README MCP Client Docs

**Files:**
- Modify: `README.md`
- Update: `docs/todos/2026-06-16-pr-622-copilot-mcp-docs/todo.md`

- [x] **Step 1: Add a VS Code Copilot table row**

Add a row near the Copilot CLI rows:

```markdown
| **GitHub Copilot in VS Code** | `.vscode/mcp.json` or VS Code user MCP settings | Uses VS Code's `servers` shape, not `mcpServers`; see the block below. |
```

- [x] **Step 2: Add a dedicated VS Code Copilot config block**

Add a short subsection after the agent table and before the sandboxed-client note. The block must use:

```json
{
  "servers": {
    "agentmemory": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "${AGENTMEMORY_URL:-http://localhost:3111}",
        "AGENTMEMORY_SECRET": "${AGENTMEMORY_SECRET:-}",
        "AGENTMEMORY_TOOLS": "${AGENTMEMORY_TOOLS:-all}"
      }
    }
  }
}
```

Explain that users should start `npx @agentmemory/agentmemory` first for the full 53-tool persistent proxy surface; otherwise the shim falls back to the local 7-tool standalone surface unless fail-hard mode is enabled.

- [x] **Step 3: Verify docs consistency**

Run:

```bash
rg -n "GitHub Copilot|VS Code|\\.vscode/mcp\\.json|\"servers\"|AGENTMEMORY_REQUIRE_SERVER" README.md
git diff --check
git status -sb --untracked-files=all
```

Expected:

- README contains both Copilot CLI and VS Code Copilot guidance.
- `git diff --check` exits 0.
- Only task-owned paths are dirty.
