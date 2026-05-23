export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
};

export const CORE_TOOLS: McpToolDef[] = [
  {
    name: "memory_search",
    description:
      "Multi-scope search across memories. scope: keyword (BM25), semantic (embeddings), file (file path history), time (chronological), graph (knowledge graph), image (CLIP). operation: backward-compatible alias (recall, smart_search, timeline, file_history, graph_query, image_search). Use scope for new code.",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Alias for scope: recall, smart_search, timeline, file_history, graph_query, image_search",
        },
        scope: {
          type: "string",
          description: "keyword (default), semantic, file, time, graph, image",
        },
        query: { type: "string", description: "Search query" },
        files: { type: "string", description: "Comma-separated file paths (file scope)" },
        sessionId: { type: "string", description: "Session ID to exclude" },
        anchor: { type: "string", description: "Anchor: ISO date or keyword (time scope)" },
        before: { type: "number", description: "Observations before anchor (default 5)" },
        after: { type: "number", description: "Observations after anchor (default 5)" },
        startNodeId: { type: "string", description: "Starting node ID (graph scope)" },
        nodeType: { type: "string", description: "Filter by node type (graph scope)" },
        maxDepth: { type: "number", description: "Max BFS depth (graph scope, default 3)" },
        memoryId: { type: "string", description: "Memory ID for relations (keyword scope)" },
        maxHops: { type: "number", description: "Max traversal depth (default 2)" },
        minConfidence: { type: "number", description: "Min confidence 0-1" },
        queryText: { type: "string", description: "Text query (image scope)" },
        queryImageRef: { type: "string", description: "Path to stored image (image scope)" },
        queryImageBase64: { type: "string", description: "Base64 image or data URL (image scope)" },
        topK: { type: "number", description: "Max results (default 10, max 50)" },
        expandIds: { type: "string", description: "Comma-separated IDs to expand (semantic scope)" },
        project: { type: "string", description: "Project path (time/graph scope)" },
        format: { type: "string", description: "Result format: full, compact, narrative" },
        token_budget: { type: "number", description: "Token budget to trim results" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
  },
  {
    name: "memory_store",
    description:
      "Save and manage memories. operation: save (store a new memory), compress_file (compress a markdown file with .original.md backup), export (export all data as JSON), consolidate (run 4-tier pipeline: episodic/semantic/procedural), claude_bridge (sync with Claude Code MEMORY.md), mesh_sync (sync with peer instances).",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "save, compress_file, export, consolidate, claude_bridge, mesh_sync",
        },
        content: { type: "string", description: "Memory content (save operation)" },
        type: {
          type: "string",
          description: "Memory type: pattern, preference, architecture, bug, workflow, fact (save operation)",
        },
        concepts: { type: "string", description: "Comma-separated key concepts (save operation)" },
        files: { type: "string", description: "Comma-separated relevant file paths (save operation)" },
        filePath: { type: "string", description: "Path to markdown file (compress_file operation)" },
        direction: { type: "string", description: "'read' or 'write' (claude_bridge operation)" },
        tier: { type: "string", description: "Target tier: episodic, semantic, or procedural (consolidate operation)" },
        peerId: { type: "string", description: "Specific peer ID (mesh_sync, omit for all)" },
        direction2: { type: "string", description: "push, pull, or both (mesh_sync operation)" },
      },
      required: ["operation"],
    },
  },
  {
    name: "memory_profile",
    description: "User/project profile with top concepts, file patterns, and conventions.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project path" },
        refresh: { type: "string", description: "Set to 'true' to force rebuild" },
      },
      required: ["project"],
    },
  },
  {
    name: "task",
    description:
      "Create and update tasks/actions. operation: create (new task with optional parent/dependency edges), update (change status/priority/details, set status='done' to complete), routine_run (instantiate a frozen workflow routine).",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "create, update, or routine_run" },
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Detailed description" },
        priority: { type: "number", description: "Priority 1-10 (10 highest)" },
        project: { type: "string", description: "Project path" },
        tags: { type: "string", description: "Comma-separated tags" },
        parentId: { type: "string", description: "Parent task ID for hierarchical tasks" },
        requires: { type: "string", description: "Comma-separated task IDs that must complete before this" },
        actionId: { type: "string", description: "Task ID to update (update operation)" },
        status: { type: "string", description: "New status: pending, active, done, blocked, cancelled" },
        result: { type: "string", description: "Outcome description (when completing)" },
        routineId: { type: "string", description: "Routine template ID (routine_run operation)" },
        initiatedBy: { type: "string", description: "Agent starting the run" },
      },
      required: ["operation"],
    },
  },
  {
    name: "task_plan",
    description:
      "Plan and coordinate task work. operation: next (single most important task by priority+urgency), frontier (all unblocked tasks ranked), lease_acquire (claim a task with TTL), lease_release (finish and unblock dependents), lease_renew (extend TTL).",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "next, frontier, lease_acquire, lease_release, or lease_renew" },
        project: { type: "string", description: "Filter by project" },
        agentId: { type: "string", description: "Current agent ID for priority scoring" },
        actionId: { type: "string", description: "Task ID (lease operations)" },
        result: { type: "string", description: "Result when releasing (marks task done)" },
        ttlMs: { type: "number", description: "Lease duration in ms (default 10min, max 1hr)" },
        limit: { type: "number", description: "Max results (frontier, default 20)" },
      },
      required: ["operation"],
    },
  },
  {
    name: "signal",
    description:
      "Send a message to another agent or broadcast, or read messages. operation: send (post a message with optional threading), read (retrieve messages for an agent, marks as read). Supports typed messages: info, request, response, alert, handoff.",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "send or read" },
        from: { type: "string", description: "Sender agent ID (send operation)" },
        to: { type: "string", description: "Recipient agent ID (omit for broadcast)" },
        content: { type: "string", description: "Message content" },
        type: { type: "string", description: "info, request, response, alert, handoff" },
        replyTo: { type: "string", description: "Signal ID to reply to (auto-threads)" },
        agentId: { type: "string", description: "Agent to read messages for (read operation)" },
        unreadOnly: { type: "string", description: "Set to 'true' for unread only" },
        threadId: { type: "string", description: "Filter by conversation thread" },
        limit: { type: "number", description: "Max messages (read operation, default 50)" },
      },
      required: ["operation"],
    },
  },
  {
    name: "checkpoint",
    description:
      "Manage external checkpoints (CI, approval, deploy status) and event-driven sentinels. operation: create (make a checkpoint gating tasks), resolve (mark passed/failed, unblocks dependents), list (show checkpoints), sentinel_create (event-driven watch), sentinel_trigger (fire a sentinel externally).",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "create, resolve, list, sentinel_create, or sentinel_trigger" },
        name: { type: "string", description: "Checkpoint/sentinel name (create)" },
        checkpointId: { type: "string", description: "Checkpoint ID (resolve)" },
        status: { type: "string", description: "passed or failed (resolve)" },
        type: { type: "string", description: "ci, approval, deploy, external, timer, webhook, threshold, pattern, custom" },
        linkedActionIds: { type: "string", description: "Comma-separated task IDs this gates" },
        sentinelId: { type: "string", description: "Sentinel ID (sentinel_trigger)" },
        result: { type: "string", description: "JSON result payload (sentinel_trigger)" },
        config: { type: "string", description: "JSON config (sentinel_create): timer:{durationMs}, threshold:{metric,operator,value}, pattern:{pattern}, webhook:{path}" },
        expiresInMs: { type: "number", description: "Auto-expire after ms" },
      },
      required: ["operation"],
    },
  },
  {
    name: "sketch",
    description:
      "Manage ephemeral action graphs for exploratory work. operation: create (make a new sketch that auto-expires), promote (commit ephemeral actions as permanent). Sketches let you explore before committing.",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "create or promote" },
        title: { type: "string", description: "Sketch title" },
        description: { type: "string", description: "What this sketch explores" },
        expiresInMs: { type: "number", description: "TTL in ms (default 1 hour)" },
        project: { type: "string", description: "Project context" },
        sketchId: { type: "string", description: "Sketch ID to promote" },
      },
      required: ["operation"],
    },
  },
  {
    name: "memory_commit_lookup",
    description:
      "Look up the agent session(s) that produced a specific git commit, given its SHA. Returns the commit metadata and linked sessions.",
    inputSchema: {
      type: "object",
      properties: {
        sha: { type: "string", description: "Full git commit SHA" },
      },
      required: ["sha"],
    },
  },
  {
    name: "memory_commits",
    description:
      "List recent commits linked to agent sessions, optionally filtered by branch or repo.",
    inputSchema: {
      type: "object",
      properties: {
        branch: { type: "string", description: "Filter by branch name" },
        repo: { type: "string", description: "Filter by remote URL" },
        limit: { type: "number", description: "Max results (default 100, max 500)" },
      },
    },
  },
];

export const V040_TOOLS: McpToolDef[] = [
  {
    name: "crystal",
    description:
      "Crystallize completed task chains into compact narrative digests via LLM summarization, or list existing crystals. operation: list (show existing crystals), crystallize (compress task chains into narrative with key outcomes, files, and lessons).",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "list or crystallize" },
        actionIds: { type: "string", description: "Comma-separated completed task IDs to crystallize" },
        project: { type: "string", description: "Project context" },
        sessionId: { type: "string", description: "Session context" },
        limit: { type: "number", description: "Max results (list operation, default 50)" },
      },
    },
  },
  {
    name: "lesson",
    description:
      "Manage learned lessons with confidence scores. Scores strengthen when reinforced, decay when unused. Duplicate content auto-strengthens existing lesson. operation: save, recall (search), list (browse), strengthen (boost confidence).",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "save, recall, list, or strengthen" },
        content: { type: "string", description: "The lesson learned (save operation)" },
        context: { type: "string", description: "When/where this lesson applies (save operation)" },
        confidence: { type: "number", description: "Initial confidence 0.0-1.0 (save, default 0.5)" },
        project: { type: "string", description: "Project this lesson is about" },
        tags: { type: "string", description: "Comma-separated tags (save operation)" },
        query: { type: "string", description: "Search query (recall operation)" },
        minConfidence: { type: "number", description: "Minimum confidence (recall/list operations)" },
        limit: { type: "number", description: "Max results (default 10)" },
        source: { type: "string", description: "Filter by source: 'manual', 'crystal', 'consolidation' (list operation)" },
        lessonId: { type: "string", description: "Lesson ID (strengthen operation)" },
      },
      required: ["operation"],
    },
  },
  {
    name: "insight",
    description:
      "Manage synthesized insights derived from memory patterns via LLM traversal and concept clustering. operation: list (show insights sorted by confidence), delete (soft-delete with audit trail). Insights are higher-order observations.",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "list or delete" },
        project: { type: "string", description: "Filter by project" },
        minConfidence: { type: "number", description: "Minimum confidence threshold (default 0)" },
        limit: { type: "number", description: "Max results (default 50)" },
        insightIds: { type: "string", description: "Comma-separated insight IDs to delete" },
        reason: { type: "string", description: "Reason for deletion" },
      },
      required: ["operation"],
    },
  },
  {
    name: "slot",
    description:
      "Manage memory slots — editable, size-limited memory units readable/writable across sessions. operation: list (show all slots), get (read one by label), create (make new, reject on duplicate), append (add text, fails 413 if over limit), replace (replace content), delete (remove slot). Pinned slots auto-inject into context.",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "list, get, create, append, replace, or delete" },
        label: { type: "string", description: "Slot label — lowercase, starts with letter, [a-z0-9_]" },
        content: { type: "string", description: "Initial or new content (create/replace operation)" },
        text: { type: "string", description: "Text to append (append operation)" },
        sizeLimit: { type: "number", description: "Max chars (create operation, default 2000, hard cap 20000)" },
        description: { type: "string", description: "What this slot is for (create operation)" },
        pinned: { type: "string", description: "'false' to exclude from context injection (create, default true)" },
        scope: { type: "string", description: "'project' (default) or 'global' (create operation)" },
      },
      required: ["operation"],
    },
  },
  {
    name: "admin",
    description:
      "Admin and governance operations. operation: diagnose (health checks across all subsystems), heal (auto-fix issues, dryRun supported), audit (view audit trail), delete (soft-delete memories or insights, use entityType to route), consolidate (run pipeline), mesh (sync with peers), obsidian (export to Obsidian vault with YAML frontmatter), verify (trace citation chain back to source observations).",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "diagnose, heal, audit, delete, consolidate, mesh, obsidian, or verify" },
        categories: { type: "string", description: "Comma-separated categories (diagnose/heal operations)" },
        dryRun: { type: "string", description: "Set to 'true' for dry run (heal operation)" },
        operation_filter: { type: "string", description: "Filter by operation type (audit operation)" },
        limit: { type: "number", description: "Max entries (audit operation, default 50)" },
        entityType: { type: "string", description: "'memory' or 'insight' (delete operation only)" },
        memoryIds: { type: "string", description: "Comma-separated memory IDs to delete" },
        insightIds: { type: "string", description: "Comma-separated insight IDs to delete" },
        reason: { type: "string", description: "Reason for deletion (delete operation)" },
        tier: { type: "string", description: "Target tier (consolidate operation)" },
        peerId: { type: "string", description: "Specific peer ID (mesh operation, omit for all)" },
        direction: { type: "string", description: "push, pull, or both (mesh operation)" },
        vaultDir: { type: "string", description: "Output directory (obsidian operation, default ~/.agentmemory/vault/)" },
        types: { type: "string", description: "Comma-separated types: memories,lessons,crystals,sessions (obsidian operation)" },
        id: { type: "string", description: "Memory/insight ID to verify (verify operation)" },
      },
      required: ["operation"],
    },
  },
];

const ESSENTIAL_TOOLS = new Set([
  "memory_search",
  "memory_store",
  "memory_profile",
  "task",
  "task_plan",
  "signal",
  "lesson",
  "insight",
]);

export function getAllTools(): McpToolDef[] {
  return [
    ...CORE_TOOLS,
    ...V040_TOOLS,
  ];
}

export function getVisibleTools(): McpToolDef[] {
  const mode = process.env["AGENTMEMORY_TOOLS"] || "core";
  if (mode === "all") return getAllTools();
  return getAllTools().filter((t) => ESSENTIAL_TOOLS.has(t.name));
}
