// Property descriptors mirror the JSON Schema fields we actually emit.
// Beyond {type, description}, tools (notably memory_query) need nested
// item schemas (items), discriminated unions (oneOf), nested object
// shapes (properties + required), and constant/enum constraints. Kept
// loose enough to express those without forcing every existing tool to
// adopt the richer shape.
export type McpPropertySchema = {
  type?: string | string[];
  description?: string;
  items?: McpPropertySchema;
  properties?: Record<string, McpPropertySchema>;
  required?: string[];
  oneOf?: McpPropertySchema[];
  anyOf?: McpPropertySchema[];
  allOf?: McpPropertySchema[];
  const?: unknown;
  enum?: unknown[];
  default?: unknown;
  additionalProperties?: boolean | McpPropertySchema;
  examples?: unknown[];
};

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, McpPropertySchema>;
    required?: string[];
  };
};

export const CORE_TOOLS: McpToolDef[] = [
  {
    name: "memory_recall",
    description:
      "Search past session observations for relevant context. Use when you need to recall what happened in previous sessions, find past decisions, or look up how a file was modified before.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (keywords, file names, concepts)",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 10)",
        },
        format: {
          type: "string",
          description: "Result format: full, compact, or narrative (default full)",
        },
        token_budget: {
          type: "number",
          description: "Optional token budget to trim returned results",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_compress_file",
    description:
      "Compress a markdown file to reduce token usage while preserving headings, URLs, and code blocks. Creates a .original.md backup before writing.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the markdown file to compress",
        },
      },
      required: ["filePath"],
    },
  },
  {
    name: "memory_save",
    description:
      "Explicitly save an important insight, decision, or pattern to long-term memory.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The insight or decision to remember",
        },
        type: {
          type: "string",
          description:
            "Memory type: pattern, preference, architecture, bug, workflow, or fact",
        },
        concepts: {
          type: "string",
          description: "Comma-separated key concepts",
        },
        files: {
          type: "string",
          description: "Comma-separated relevant file paths",
        },
        project: {
          type: "string",
          description:
            "Stable canonical project identifier this memory belongs to (e.g. a slug, " +
            "UUID, or registry key). Must match the value used when the session was " +
            "started. Do not use filesystem paths or ad-hoc display names — those " +
            "change across machines and will silently break project scoping.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_file_history",
    description: "Get past observations about specific files.",
    inputSchema: {
      type: "object",
      properties: {
        files: { type: "string", description: "Comma-separated file paths" },
        sessionId: {
          type: "string",
          description: "Current session ID to exclude",
        },
      },
      required: ["files"],
    },
  },
  {
    name: "memory_patterns",
    description: "Detect recurring patterns across sessions.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project path to analyze" },
      },
    },
  },
  {
    name: "memory_sessions",
    description:
      "List recent sessions with their status and observation counts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "memory_smart_search",
    description: "Hybrid semantic+keyword search with progressive disclosure.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        expandIds: {
          type: "string",
          description: "Comma-separated observation IDs to expand",
        },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_lineage",
    description:
      "Concept lineage: chronologically-ordered hits for a phrase across observation, memory, lesson, and summary channels. Use to trace when a term first entered the corpus and what surrounded it.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Phrase or term to trace" },
        limit: { type: "number", description: "Max timeline items (default 50)" },
        since: { type: "string", description: "ISO 8601 lower bound on timestamp" },
        until: { type: "string", description: "ISO 8601 upper bound on timestamp" },
        channels: {
          type: "string",
          description:
            "Comma-separated channels to search: observation,memory,lesson,summary (default all)",
        },
        includeAdjacentTurns: {
          type: "boolean",
          description: "Attach previous user/assistant turn for observation hits (default true)",
        },
        includeGraph: {
          type: "boolean",
          description: "Attach graph-edge neighbors for matching nodes (default false)",
        },
        order: {
          type: "string",
          description: "'asc' (oldest first, default) or 'desc'",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_vision_search",
    description:
      "Cross-modal image search via CLIP embeddings. Pass queryText to find screenshots matching a description, or queryImageBase64/queryImageRef to find similar images. Requires AGENTMEMORY_IMAGE_EMBEDDINGS=true.",
    inputSchema: {
      type: "object",
      properties: {
        queryText: { type: "string", description: "Text query (e.g. 'login form with error banner')" },
        queryImageRef: { type: "string", description: "Absolute path to a stored image to match against" },
        queryImageBase64: { type: "string", description: "Raw base64 image bytes or data URL" },
        topK: { type: "number", description: "Max results (default 10, max 50)" },
        sessionId: { type: "string", description: "Filter to a single session" },
      },
    },
  },
  {
    name: "memory_timeline",
    description: "Chronological observations around an anchor point.",
    inputSchema: {
      type: "object",
      properties: {
        anchor: {
          type: "string",
          description: "Anchor point: ISO date or keyword",
        },
        project: { type: "string", description: "Filter by project path" },
        before: {
          type: "number",
          description: "Observations before anchor (default 5)",
        },
        after: {
          type: "number",
          description: "Observations after anchor (default 5)",
        },
      },
      required: ["anchor"],
    },
  },
  {
    name: "memory_profile",
    description: "User/project profile with top concepts and file patterns.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project path" },
        refresh: {
          type: "string",
          description: "Set to 'true' to force rebuild",
        },
      },
      required: ["project"],
    },
  },
  {
    name: "memory_export",
    description: "Export all memory data as JSON.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "memory_relations",
    description: "Query the memory relationship graph.",
    inputSchema: {
      type: "object",
      properties: {
        memoryId: {
          type: "string",
          description: "Memory ID to find relations for",
        },
        maxHops: {
          type: "number",
          description: "Max traversal depth (default 2)",
        },
        minConfidence: {
          type: "number",
          description: "Min confidence (0-1, default 0)",
        },
      },
      required: ["memoryId"],
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
    name: "memory_claude_bridge_sync",
    description:
      "Sync memory state to/from Claude Code's native MEMORY.md file.",
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          description:
            "'read' to import from MEMORY.md, 'write' to export to MEMORY.md",
        },
      },
      required: ["direction"],
    },
  },
  {
    name: "memory_graph_query",
    description: "Query the knowledge graph for entities and relationships.",
    inputSchema: {
      type: "object",
      properties: {
        startNodeId: {
          type: "string",
          description: "Starting node ID for traversal",
        },
        nodeType: { type: "string", description: "Filter by node type" },
        maxDepth: {
          type: "number",
          description: "Max BFS depth (default 3, max 5)",
        },
        query: { type: "string", description: "Search nodes by name" },
      },
    },
  },
  {
    name: "memory_consolidate",
    description:
      "Run the 4-tier memory consolidation pipeline (working -> episodic -> semantic -> procedural).",
    inputSchema: {
      type: "object",
      properties: {
        tier: {
          type: "string",
          description: "Target tier: episodic, semantic, or procedural",
        },
      },
    },
  },
  {
    name: "memory_team_share",
    description: "Share a memory or observation with team members.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "ID of memory or observation to share",
        },
        itemType: {
          type: "string",
          description: "Type: observation, memory, or pattern",
        },
      },
      required: ["itemId", "itemType"],
    },
  },
  {
    name: "memory_team_feed",
    description: "Get recent shared items from all team members.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max items (default 20)" },
      },
    },
  },
  {
    name: "memory_audit",
    description: "View the audit trail of memory operations.",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "Filter by operation type" },
        limit: { type: "number", description: "Max entries (default 50)" },
      },
    },
  },
  {
    name: "memory_governance_delete",
    description: "Delete specific memories with audit trail.",
    inputSchema: {
      type: "object",
      properties: {
        memoryIds: {
          type: "string",
          description: "Comma-separated memory IDs to delete",
        },
        reason: { type: "string", description: "Reason for deletion" },
      },
      required: ["memoryIds"],
    },
  },
  {
    name: "memory_snapshot_create",
    description: "Create a git-versioned snapshot of current memory state.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Snapshot description" },
      },
    },
  },
];

export const V050_TOOLS: McpToolDef[] = [
  {
    name: "memory_action_create",
    description:
      "Create an actionable work item with typed dependencies. Actions track what agents need to do and how work items relate to each other.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Action title" },
        description: {
          type: "string",
          description: "Detailed description of the work",
        },
        priority: {
          type: "number",
          description: "Priority 1-10 (10 highest)",
        },
        project: { type: "string", description: "Project path" },
        tags: {
          type: "string",
          description: "Comma-separated tags",
        },
        parentId: {
          type: "string",
          description: "Parent action ID for hierarchical actions",
        },
        requires: {
          type: "string",
          description:
            "Comma-separated action IDs that must complete before this",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "memory_action_update",
    description:
      "Update an action's status, priority, or details. Set status to 'done' to complete it and unblock dependent actions.",
    inputSchema: {
      type: "object",
      properties: {
        actionId: { type: "string", description: "Action ID to update" },
        status: {
          type: "string",
          description: "New status: pending, active, done, blocked, cancelled",
        },
        result: {
          type: "string",
          description: "Outcome description (when completing)",
        },
        priority: { type: "number", description: "New priority 1-10" },
      },
      required: ["actionId"],
    },
  },
  {
    name: "memory_frontier",
    description:
      "Get all unblocked actions ranked by priority and urgency. Returns the frontier of actionable work with no unsatisfied dependencies.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Filter by project" },
        agentId: {
          type: "string",
          description: "Agent ID to check lease conflicts",
        },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "memory_next",
    description:
      "Get the single most important next action to work on. Combines dependency resolution, priority, and recency into a score.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Filter by project" },
        agentId: { type: "string", description: "Current agent ID" },
      },
    },
  },
  {
    name: "memory_lease",
    description:
      "Acquire, release, or renew an exclusive lease on an action. Prevents multiple agents from working on the same thing.",
    inputSchema: {
      type: "object",
      properties: {
        actionId: { type: "string", description: "Action ID" },
        agentId: { type: "string", description: "Agent claiming the action" },
        operation: {
          type: "string",
          description: "acquire, release, or renew",
        },
        result: {
          type: "string",
          description: "Result when releasing (marks action done)",
        },
        ttlMs: {
          type: "number",
          description: "Lease duration in ms (default 10min, max 1hr)",
        },
      },
      required: ["actionId", "agentId", "operation"],
    },
  },
  {
    name: "memory_routine_run",
    description:
      "Instantiate a frozen workflow routine, creating actions for each step with proper dependencies.",
    inputSchema: {
      type: "object",
      properties: {
        routineId: { type: "string", description: "Routine template ID" },
        project: { type: "string", description: "Project context" },
        initiatedBy: { type: "string", description: "Agent starting the run" },
      },
      required: ["routineId"],
    },
  },
  {
    name: "memory_signal_send",
    description:
      "Send a message to another agent or broadcast. Supports threading, typed messages, and TTL expiration.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Sender agent ID" },
        to: {
          type: "string",
          description: "Recipient agent ID (omit for broadcast)",
        },
        content: { type: "string", description: "Message content" },
        type: {
          type: "string",
          description: "Message type: info, request, response, alert, handoff",
        },
        replyTo: {
          type: "string",
          description: "Signal ID to reply to (auto-threads)",
        },
      },
      required: ["from", "content"],
    },
  },
  {
    name: "memory_signal_read",
    description:
      "Read messages for an agent. Marks delivered messages as read.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent to read messages for" },
        unreadOnly: {
          type: "string",
          description: "Set to 'true' for unread only",
        },
        threadId: {
          type: "string",
          description: "Filter by conversation thread",
        },
        limit: { type: "number", description: "Max messages (default 50)" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "memory_checkpoint",
    description:
      "Create or resolve an external checkpoint (CI result, approval, deploy status) that gates action progress.",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "create, resolve, or list",
        },
        name: { type: "string", description: "Checkpoint name (for create)" },
        checkpointId: {
          type: "string",
          description: "Checkpoint ID (for resolve)",
        },
        status: {
          type: "string",
          description: "passed or failed (for resolve)",
        },
        type: {
          type: "string",
          description: "Checkpoint type: ci, approval, deploy, external, timer",
        },
        linkedActionIds: {
          type: "string",
          description:
            "Comma-separated action IDs this checkpoint gates (for create)",
        },
      },
      required: ["operation"],
    },
  },
  {
    name: "memory_mesh_sync",
    description:
      "Sync memories and actions with peer agentmemory instances for multi-agent collaboration.",
    inputSchema: {
      type: "object",
      properties: {
        peerId: {
          type: "string",
          description: "Specific peer ID (omit for all)",
        },
        direction: {
          type: "string",
          description: "push, pull, or both (default both)",
        },
      },
    },
  },
];

export const V051_TOOLS: McpToolDef[] = [
  {
    name: "memory_sentinel_create",
    description:
      "Create an event-driven sentinel that watches for conditions (webhook, timer, threshold, pattern, approval) and auto-unblocks gated actions when triggered.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Sentinel name" },
        type: {
          type: "string",
          description: "Type: webhook, timer, threshold, pattern, approval, custom",
        },
        config: {
          type: "string",
          description: "JSON config (timer: {durationMs}, threshold: {metric,operator,value}, pattern: {pattern}, webhook: {path})",
        },
        linkedActionIds: {
          type: "string",
          description: "Comma-separated action IDs to gate",
        },
        expiresInMs: { type: "number", description: "Auto-expire after ms" },
      },
      required: ["name", "type"],
    },
  },
  {
    name: "memory_sentinel_trigger",
    description:
      "Externally fire a sentinel, providing an optional result payload. Unblocks any gated actions.",
    inputSchema: {
      type: "object",
      properties: {
        sentinelId: { type: "string", description: "Sentinel ID to trigger" },
        result: { type: "string", description: "JSON result payload" },
      },
      required: ["sentinelId"],
    },
  },
  {
    name: "memory_sketch_create",
    description:
      "Create an ephemeral action graph for exploratory work. Auto-expires after TTL. Can be promoted to permanent actions or discarded.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Sketch title" },
        description: { type: "string", description: "What this sketch explores" },
        expiresInMs: { type: "number", description: "TTL in ms (default 1 hour)" },
        project: { type: "string", description: "Project context" },
      },
      required: ["title"],
    },
  },
  {
    name: "memory_sketch_promote",
    description:
      "Promote a sketch's ephemeral actions to permanent actions. Makes the exploratory work official.",
    inputSchema: {
      type: "object",
      properties: {
        sketchId: { type: "string", description: "Sketch ID to promote" },
        project: { type: "string", description: "Override project for promoted actions" },
      },
      required: ["sketchId"],
    },
  },
  {
    name: "memory_crystallize",
    description:
      "Compress completed action chains into compact crystal digests using LLM summarization. Extracts narrative, key outcomes, files affected, and lessons.",
    inputSchema: {
      type: "object",
      properties: {
        actionIds: {
          type: "string",
          description: "Comma-separated completed action IDs to crystallize",
        },
        project: { type: "string", description: "Project context" },
        sessionId: { type: "string", description: "Session context" },
      },
      required: ["actionIds"],
    },
  },
  {
    name: "memory_diagnose",
    description:
      "Run health checks across all subsystems (actions, leases, sentinels, sketches, signals, sessions, memories, mesh). Identifies stuck, orphaned, and inconsistent state.",
    inputSchema: {
      type: "object",
      properties: {
        categories: {
          type: "string",
          description: "Comma-separated categories to check (default all)",
        },
      },
    },
  },
  {
    name: "memory_heal",
    description:
      "Auto-fix all fixable issues found by diagnostics. Unblocks stuck actions, expires stale leases, cleans up orphaned data.",
    inputSchema: {
      type: "object",
      properties: {
        categories: {
          type: "string",
          description: "Comma-separated categories to heal (default all)",
        },
        dryRun: {
          type: "string",
          description: "Set to 'true' for dry run (report but don't fix)",
        },
      },
    },
  },
  {
    name: "memory_facet_tag",
    description:
      "Attach a structured tag (dimension:value) to an action, memory, or observation for multi-dimensional categorization.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string", description: "ID of the target to tag" },
        targetType: {
          type: "string",
          description: "Type: action, memory, or observation",
        },
        dimension: { type: "string", description: "Tag dimension (e.g., priority, team, status)" },
        value: { type: "string", description: "Tag value (e.g., urgent, backend, reviewed)" },
      },
      required: ["targetId", "targetType", "dimension", "value"],
    },
  },
  {
    name: "memory_facet_query",
    description:
      "Query targets by facet tags with AND/OR logic. Find all actions tagged priority:urgent AND team:backend.",
    inputSchema: {
      type: "object",
      properties: {
        matchAll: {
          type: "string",
          description: "Comma-separated dimension:value pairs (AND logic)",
        },
        matchAny: {
          type: "string",
          description: "Comma-separated dimension:value pairs (OR logic)",
        },
        targetType: {
          type: "string",
          description: "Filter by type: action, memory, or observation",
        },
      },
    },
  },
];

export const V061_TOOLS: McpToolDef[] = [
  {
    name: "memory_verify",
    description:
      "Verify a memory or observation by tracing its citation chain back to source observations and session context. Returns provenance information including confidence scores.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Memory ID or observation ID to verify",
        },
      },
      required: ["id"],
    },
  },
];

export const V070_TOOLS: McpToolDef[] = [
  {
    name: "memory_lesson_save",
    description:
      "Save a lesson learned from this session. Lessons have confidence scores that strengthen when reinforced and decay when not used. Duplicate content auto-strengthens the existing lesson.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The lesson learned (what worked, what to avoid, when to use X approach)",
        },
        context: {
          type: "string",
          description: "When/where this lesson applies",
        },
        confidence: {
          type: "number",
          description: "Initial confidence 0.0-1.0 (default 0.5)",
        },
        project: { type: "string", description: "Project this lesson is about" },
        tags: { type: "string", description: "Comma-separated tags" },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_lesson_recall",
    description:
      "Search lessons by query. Returns lessons sorted by confidence and recency. Use to check what the agent has learned before making decisions.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        project: { type: "string", description: "Filter by project" },
        minConfidence: {
          type: "number",
          description: "Minimum confidence threshold (default 0.1)",
        },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_obsidian_export",
    description:
      "Export memories, lessons, and crystals as Obsidian-compatible Markdown files with YAML frontmatter and wikilinks for graph view.",
    inputSchema: {
      type: "object",
      properties: {
        vaultDir: {
          type: "string",
          description: "Output directory (default ~/.agentmemory/vault/)",
        },
        types: {
          type: "string",
          description: "Comma-separated types to export: memories,lessons,crystals,sessions (default all)",
        },
      },
    },
  },
];

export const V073_TOOLS: McpToolDef[] = [
  {
    name: "memory_reflect",
    description:
      "Traverse the knowledge graph, group related memories by concept clusters, and synthesize higher-order insights via LLM. Returns new and reinforced insights.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Filter by project" },
        maxClusters: {
          type: "number",
          description: "Max concept clusters to process (default 10, max 20)",
        },
      },
    },
  },
  {
    name: "memory_insight_list",
    description:
      "List synthesized insights — higher-order observations derived from patterns across memories, lessons, and crystals.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Filter by project" },
        minConfidence: {
          type: "number",
          description: "Minimum confidence threshold (default 0)",
        },
        limit: { type: "number", description: "Max results (default 50)" },
      },
    },
  },
];

export const V010_SLOTS_TOOLS: McpToolDef[] = [
  {
    name: "memory_slot_list",
    description:
      "List all memory slots (pinned + project + global). Slots are editable, size-limited memory units the agent can read and modify across sessions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "memory_slot_get",
    description: "Read a single slot by label.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Slot label (e.g. 'persona', 'pending_items')" },
      },
      required: ["label"],
    },
  },
  {
    name: "memory_slot_create",
    description: "Create a new slot. Reject if a slot with the same label already exists.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Slot label — lowercase, starts with letter, [a-z0-9_]" },
        content: { type: "string", description: "Initial content (default empty)" },
        sizeLimit: { type: "number", description: "Max chars (default 2000, hard cap 20000)" },
        description: { type: "string", description: "What this slot is for" },
        pinned: { type: "string", description: "'false' to exclude from context injection; default true" },
        scope: { type: "string", description: "'project' (default) or 'global' (shared across projects)" },
      },
      required: ["label"],
    },
  },
  {
    name: "memory_slot_append",
    description:
      "Append text to an existing slot. Fails with 413 if the append would exceed the slot's sizeLimit — agent must compact via memory_slot_replace first.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Slot label" },
        text: { type: "string", description: "Text to append" },
      },
      required: ["label", "text"],
    },
  },
  {
    name: "memory_slot_replace",
    description: "Replace slot content in place. Fails if content exceeds sizeLimit.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Slot label" },
        content: { type: "string", description: "New full content" },
      },
      required: ["label", "content"],
    },
  },
  {
    name: "memory_slot_delete",
    description: "Delete a slot. Seeded default slots can be deleted unless marked readOnly.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Slot label" },
      },
      required: ["label"],
    },
  },
];

// ---------------------------------------------------------------------------
// memory_query (v5-A) — server-side composable retrieval pipeline.
// ---------------------------------------------------------------------------

// Reused across every step variant. `in`/`out` route between named
// streams; default stream name is "_". `id` is an optional debug label
// echoed back in the per-step trace.
const QUERY_STEP_BASE_PROPS: Record<string, McpPropertySchema> = {
  id: { type: "string", description: "Optional debug label echoed in trace." },
  in: {
    type: "string",
    description:
      "Named input stream (default '_'). For multi-stream consumers like `concat`, send `in` as an array of stream names. Producers usually omit this.",
  },
  out: {
    type: "string",
    description:
      "Named output stream (default '_'). Set to fork a producer's results into a sidecar stream that downstream steps can `join` against.",
  },
};

// Shared sub-schema for filter predicates. Recursive: predicates compose
// via `all`/`any`/`not`. Each leaf is `{field, op, value}` with `field`
// supporting dot-paths against the envelope.
const QUERY_PREDICATE_SCHEMA: McpPropertySchema = {
  description:
    "Filter predicate. Leaf form: {field, op, value}. Compose with {all|any: [Predicate, ...]} or {not: Predicate}. `field` accepts dot-paths against the record envelope (e.g. '_kind', '_session.project', 'type'). `op` values: eq, neq, in, not_in, gt, gte, lt, lte, contains, starts_with, exists, since, until. ISO timestamps required for since/until.",
  // anyOf so schema-aware models can offer either leaf or composite.
  anyOf: [
    {
      type: "object",
      properties: {
        field: { type: "string" },
        op: {
          enum: [
            "eq",
            "neq",
            "in",
            "not_in",
            "gt",
            "gte",
            "lt",
            "lte",
            "contains",
            "starts_with",
            "exists",
            "since",
            "until",
          ],
        },
        value: {},
      },
      required: ["field", "op"],
    },
    { type: "object", properties: { all: { type: "array" } }, required: ["all"] },
    { type: "object", properties: { any: { type: "array" } }, required: ["any"] },
    { type: "object", properties: { not: {} }, required: ["not"] },
  ],
};

// Each step variant declares its `op` as a const and lists its
// op-specific fields alongside the shared `id`/`in`/`out` base. Required
// fields are explicit so schema-aware tool-use models autocomplete the
// right shape.
const QUERY_STEP_SCHEMAS: McpPropertySchema[] = [
  // ---- Producers ----------------------------------------------------------
  {
    type: "object",
    description: "search — BM25/hybrid observation search. Wraps mem::search.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "search" },
      query: { type: "string" },
      limit: { type: "number", description: "Max raw hits (default 10)." },
      format: { enum: ["full", "compact", "narrative"] },
      token_budget: { type: "number" },
      maxOut: { type: "number", description: "Post-mapping record cap (default 500)." },
    },
    required: ["op", "query"],
  },
  {
    type: "object",
    description:
      "smart_search — hybrid BM25+vector+graph with lessons-first ranker. Wraps mem::smart-search.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "smart_search" },
      query: { type: "string" },
      limit: { type: "number" },
      project: { type: "string" },
      includeLessons: { type: "boolean" },
      maxOut: { type: "number" },
    },
    required: ["op", "query"],
  },
  {
    type: "object",
    description:
      "lineage — chronologically-ordered hits across observation/memory/lesson/summary channels. Wraps mem::lineage. Use to answer 'when did this term enter the corpus?'.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "lineage" },
      query: { type: "string" },
      limit: { type: "number" },
      since: { type: "string", description: "ISO timestamp lower bound." },
      until: { type: "string", description: "ISO timestamp upper bound." },
      channels: {
        type: "array",
        items: { enum: ["observation", "memory", "lesson", "summary"] },
      },
      includeAdjacentTurns: { type: "boolean" },
      includeGraph: { type: "boolean" },
      order: { enum: ["asc", "desc"] },
      maxOut: { type: "number" },
    },
    required: ["op", "query"],
  },
  {
    type: "object",
    description: "lesson_recall — full-text lesson search with confidence decay. Wraps mem::lesson-recall.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "lesson_recall" },
      query: { type: "string" },
      project: { type: "string" },
      minConfidence: { type: "number" },
      limit: { type: "number" },
      maxOut: { type: "number" },
    },
    required: ["op", "query"],
  },
  {
    type: "object",
    description:
      "graph_query — BFS the concept graph. Returns graph_node and graph_edge records. Wraps mem::graph-query.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "graph_query" },
      startNodeId: { type: "string" },
      nodeType: { type: "string" },
      query: { type: "string" },
      maxDepth: { type: "number" },
      maxOut: { type: "number" },
    },
    required: ["op"],
  },
  {
    type: "object",
    description:
      "facet_query — multi-dimensional tag query (AND/OR). At least one of matchAll/matchAny required. Wraps mem::facet-query.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "facet_query" },
      matchAll: { type: "array", items: { type: "string" } },
      matchAny: { type: "array", items: { type: "string" } },
      targetType: { type: "string" },
      limit: { type: "number" },
      maxOut: { type: "number" },
    },
    required: ["op"],
  },
  {
    type: "object",
    description: "insight_list — synthesized insights, sorted by confidence. Wraps mem::insight-list.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "insight_list" },
      project: { type: "string" },
      minConfidence: { type: "number" },
      limit: { type: "number" },
      maxOut: { type: "number" },
    },
    required: ["op"],
  },
  {
    type: "object",
    description:
      "timeline — observations around a temporal/keyword anchor. Wraps mem::timeline.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "timeline" },
      anchor: { type: "string", description: "ISO timestamp or keyword." },
      project: { type: "string" },
      before: { type: "number" },
      after: { type: "number" },
      maxOut: { type: "number" },
    },
    required: ["op", "anchor"],
  },
  {
    type: "object",
    description: "sessions — list known sessions. Reads KV.sessions directly (no LLM, no scan cost).",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "sessions" },
      project: { type: "string", description: "Optional project filter." },
      maxOut: { type: "number" },
    },
    required: ["op"],
  },
  {
    type: "object",
    description: "frontier — unblocked actions ranked by priority+recency. Wraps mem::frontier.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "frontier" },
      project: { type: "string" },
      agentId: { type: "string" },
      limit: { type: "number" },
      maxOut: { type: "number" },
    },
    required: ["op"],
  },
  {
    type: "object",
    description: "vision_search — CLIP-embedding image+text search. Wraps mem::vision-search.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "vision_search" },
      queryText: { type: "string" },
      queryImageRef: { type: "string" },
      queryImageBase64: { type: "string" },
      topK: { type: "number" },
      sessionId: { type: "string" },
      maxOut: { type: "number" },
    },
    required: ["op"],
  },
  {
    type: "object",
    description:
      "profile — single-record project cohort profile (topConcepts/topFiles/etc.). Wraps mem::profile. Returns ONE envelope with _kind='profile'.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "profile" },
      project: { type: "string" },
      refresh: { type: "boolean" },
    },
    required: ["op", "project"],
  },
  // ---- Transformers (pure JS, no I/O) -------------------------------------
  {
    type: "object",
    description: "filter — keep records matching the predicate.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "filter" },
      where: QUERY_PREDICATE_SCHEMA,
    },
    required: ["op", "where"],
  },
  {
    type: "object",
    description: "sort — stable multi-key sort. ISO timestamps compare as time.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "sort" },
      by: {
        description: "Field path (string) or array of paths for tiebreakers. Dot-paths supported.",
        anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
      },
      dir: { enum: ["asc", "desc"] },
    },
    required: ["op", "by"],
  },
  {
    type: "object",
    description: "limit — keep the first N records.",
    properties: { ...QUERY_STEP_BASE_PROPS, op: { const: "limit" }, n: { type: "number" } },
    required: ["op", "n"],
  },
  {
    type: "object",
    description: "take — alias for limit.",
    properties: { ...QUERY_STEP_BASE_PROPS, op: { const: "take" }, n: { type: "number" } },
    required: ["op", "n"],
  },
  {
    type: "object",
    description: "drop — skip the first N records.",
    properties: { ...QUERY_STEP_BASE_PROPS, op: { const: "drop" }, n: { type: "number" } },
    required: ["op", "n"],
  },
  {
    type: "object",
    description:
      "project — trim/rename fields. Envelope core (_kind, _id, _source, ...) is always preserved.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "project" },
      fields: {
        type: "array",
        items: { type: "string" },
        description: "Whitelist of field paths to keep beyond envelope core.",
      },
      rename: {
        type: "object",
        description: "Map of fromPath → toPath. Original field is kept.",
        additionalProperties: { type: "string" },
      },
    },
    required: ["op"],
  },
  {
    type: "object",
    description: "distinct — dedup by a field (default '_id').",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "distinct" },
      by: { type: "string" },
    },
    required: ["op"],
  },
  {
    type: "object",
    description: "flatten — explode an array-valued field into one row per item.",
    properties: { ...QUERY_STEP_BASE_PROPS, op: { const: "flatten" }, field: { type: "string" } },
    required: ["op", "field"],
  },
  {
    type: "object",
    description:
      "concat — union two or more named streams. The `in` field MUST be an array of stream names for this op.",
    properties: {
      id: QUERY_STEP_BASE_PROPS.id,
      out: QUERY_STEP_BASE_PROPS.out,
      op: { const: "concat" },
      in: { type: "array", items: { type: "string" } },
    },
    required: ["op", "in"],
  },
  {
    type: "object",
    description:
      "group_by — partition stream by field. Produces _kind='group' records with `members[]`. Pair with top_n_per_group to re-flatten.",
    properties: { ...QUERY_STEP_BASE_PROPS, op: { const: "group_by" }, by: { type: "string" } },
    required: ["op", "by"],
  },
  {
    type: "object",
    description: "top_n_per_group — within each group_by group, sort members and keep top N. Re-flattens.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "top_n_per_group" },
      n: { type: "number" },
      by: { type: "string", description: "Field to sort within each group (default '_score')." },
      dir: { enum: ["asc", "desc"] },
    },
    required: ["op", "n"],
  },
  // ---- Cross-step ---------------------------------------------------------
  {
    type: "object",
    description:
      "for_each — run a sub-pipeline per record. `into: merge` flattens results; `into: list` wraps each iteration as a _kind='group' record. synthesize/rank_by_relevance/nested for_each are REJECTED inside.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "for_each" },
      do: { type: "array", description: "Sub-pipeline steps." },
      into: { enum: ["merge", "list"] },
    },
    required: ["op", "do"],
  },
  {
    type: "object",
    description:
      "join — hash-join two streams on a field. Output emits records of the LEFT shape with an attached `_join.right` (matched right record or null).",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "join" },
      right: { type: "string", description: "Name of the right-side stream." },
      on: {
        type: "object",
        properties: {
          left: { type: "string", description: "Field path on left." },
          right: { type: "string", description: "Field path on right." },
        },
        required: ["left", "right"],
      },
      type: { enum: ["inner", "left"] },
    },
    required: ["op", "right", "on"],
  },
  {
    type: "object",
    description:
      "expand_by_session — for each unique value of `field` (default '_sessionId'), fetch Session + SessionSummary from KV and attach as `_session` + `_summary` on every record. Cached per unique id within the step.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "expand_by_session" },
      field: { type: "string" },
    },
    required: ["op"],
  },
  // ---- Aggregators (LLM) --------------------------------------------------
  {
    type: "object",
    description:
      "synthesize — terminal LLM aggregator. Returns {summary, citations[]}. MUST be the last step. One LLM call. Result kind switches to 'synthesis'.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "synthesize" },
      question: { type: "string" },
      style: { enum: ["answer", "bullets", "timeline"] },
      maxCitations: { type: "number" },
    },
    required: ["op", "question"],
  },
  {
    type: "object",
    description:
      "rank_by_relevance — re-score and re-sort records by LLM relevance to `target`. Non-terminal (still emits records). One LLM call.",
    properties: {
      ...QUERY_STEP_BASE_PROPS,
      op: { const: "rank_by_relevance" },
      target: { type: "string" },
      topK: { type: "number" },
    },
    required: ["op", "target"],
  },
];

const QUERY_OPTIONS_SCHEMA: McpPropertySchema = {
  type: "object",
  description: "Execution knobs.",
  properties: {
    budget: {
      type: "number",
      description:
        "Sum of step cost units (cheap=1, medium=3, expensive=10). Default 30, max 100. Pipeline aborts if exceeded.",
    },
    timeoutMs: { type: "number", description: "Default 10000, max 30000. Deadline checked per step." },
    maxStepOut: { type: "number", description: "Records-per-step cap. Default 500, max 2000." },
    maxDepth: { type: "number", description: "for_each nesting cap. Default 3, max 5." },
    dry_run: {
      type: "boolean",
      description:
        "If true, validate the pipeline + return {kind:'dry_run', plan, estimatedCost} without executing any step. Recommended to invoke once with dry_run before paying for a costly pipeline.",
    },
  },
};

// Three literal examples covering simple → multi-stream → terminal-LLM
// to anchor the LLM's mental model. Echoed in the description so
// non-schema-aware models see them too.
const QUERY_EXAMPLES = [
  {
    title: "1) Recent decision memories about X (no LLM)",
    pipeline: [
      { op: "search", query: "decision about X", limit: 30 },
      { op: "filter", where: { field: "_kind", op: "eq", value: "memory" } },
      { op: "sort", by: "_createdAt", dir: "desc" },
      { op: "limit", n: 5 },
    ],
  },
  {
    title: "2) Per-project top-2 lineage hits, by score (no LLM)",
    pipeline: [
      { op: "lineage", query: "Y", limit: 200 },
      { op: "filter", where: { field: "_project", op: "exists" } },
      { op: "group_by", by: "_project" },
      { op: "top_n_per_group", n: 2, by: "_score", dir: "desc" },
    ],
  },
  {
    title:
      "3) Multi-stream join + terminal synthesis (1 LLM call) — recall + lessons over the past 7 days",
    pipeline: [
      {
        op: "lineage",
        out: "ctx",
        query: "X",
        since: "2026-05-12T00:00:00Z",
        limit: 100,
      },
      { op: "lesson_recall", out: "lessons", query: "X", limit: 30 },
      {
        op: "join",
        in: "ctx",
        right: "lessons",
        on: { left: "_sessionId", right: "_sessionId" },
        type: "left",
      },
      { op: "rank_by_relevance", target: "explain X", topK: 12 },
      {
        op: "synthesize",
        question: "Explain X in light of recent activity and lessons.",
        style: "bullets",
        maxCitations: 10,
      },
    ],
    options: { budget: 50, timeoutMs: 20000 },
  },
];

const QUERY_DESCRIPTION = `Run a composable retrieval pipeline in a single MCP call. The pipeline is an array of typed step objects; each step has \`op\` plus op-specific fields. Use this as your FIRST reach for "what do I remember about X" questions — composition is server-side so multi-step recall is one round-trip, not N.

WORKFLOW: invoke once with options.dry_run=true to validate shape + see estimatedCost, then re-invoke without dry_run. Read-only by construction — writers are rejected.

STREAMS: default stream is "_". Most steps thread it implicitly. Use \`out: "name"\` on a producer to fork into a named stream, then \`in: "name"\` (or \`right: "name"\` for join, \`in: ["a","b"]\` for concat) to pull from it.

ENVELOPE: every record normalizes to \`{_kind, _id, _sessionId?, _project?, _createdAt?, _score?, _kindSpecific?, _source, ...rawFields}\`. Legal _kind values: observation, memory, lesson, insight, action, session, summary, timeline_item, graph_node, graph_edge, slot, facet_hit, signal, checkpoint, frontier_entry, vision_hit, profile, group. Predicates and sort use dot-paths (\`_kind\`, \`_session.project\`, \`type\`).

OPS — producers: search, smart_search, lineage, lesson_recall, graph_query, facet_query, insight_list, timeline, sessions, frontier, vision_search, profile. Transformers (pure JS): filter, sort, limit/take/drop, project, distinct, flatten, concat, group_by, top_n_per_group. Cross-step: for_each (synthesize/rank inside REJECTED), join, expand_by_session. Aggregators (LLM): synthesize (must be terminal; switches result.kind → "synthesis"), rank_by_relevance (non-terminal, one LLM call).

LITERAL EXAMPLES:
${QUERY_EXAMPLES.map(
  (ex) => `${ex.title}\n${JSON.stringify({ pipeline: ex.pipeline, ...(("options" in ex && ex.options) ? { options: ex.options } : {}) }, null, 2)}`,
).join("\n\n")}

Options: budget (default 30, max 100), timeoutMs (default 10000, max 30000), maxStepOut (default 500), maxDepth (default 3, max 5), dry_run.`;

export const V020_QUERY_TOOLS: McpToolDef[] = [
  {
    name: "memory_query",
    description: QUERY_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        pipeline: {
          type: "array",
          description:
            "Ordered pipeline steps. Each item is a discriminated-union object keyed by `op`. See the per-op schemas (oneOf) for the exact shape of each step.",
          items: { oneOf: QUERY_STEP_SCHEMAS },
        },
        options: QUERY_OPTIONS_SCHEMA,
      },
      required: ["pipeline"],
    },
  },
];

export const ESSENTIAL_TOOLS = new Set([
  "memory_save",
  "memory_recall",
  "memory_consolidate",
  "memory_smart_search",
  "memory_sessions",
  "memory_diagnose",
  "memory_lesson_save",
  "memory_reflect",
  "memory_query",
]);

export function getAllTools(): McpToolDef[] {
  return [
    ...CORE_TOOLS,
    ...V040_TOOLS,
    ...V050_TOOLS,
    ...V051_TOOLS,
    ...V061_TOOLS,
    ...V070_TOOLS,
    ...V073_TOOLS,
    ...V010_SLOTS_TOOLS,
    ...V020_QUERY_TOOLS,
  ];
}

// default switched from "core" (8 essential tools) to "all"
// (full 53-tool surface). README and plugin manifests have always
// advertised 53 tools "in proxy mode"; the old default left OpenCode /
// Claude Code users seeing 8 with no indication the other tools existed.
// Users who want the lean essentials can still set AGENTMEMORY_TOOLS=core.
export function getVisibleTools(): McpToolDef[] {
  const mode = process.env["AGENTMEMORY_TOOLS"] || "all";
  if (mode === "core") return getAllTools().filter((t) => ESSENTIAL_TOOLS.has(t.name));
  return getAllTools();
}
