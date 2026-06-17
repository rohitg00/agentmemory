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
        project: {
          type: "string",
          description:
            "Optional opaque canonical project identifier to restrict recall. Use the same value " +
            "that session hooks store as project; linked Git worktrees share one git:<hash> value.",
        },
        start_time: {
          type: "string",
          description: "Optional inclusive ISO 8601 lower time bound for observation timestamps",
        },
        end_time: {
          type: "string",
          description: "Optional inclusive ISO 8601 upper time bound for observation timestamps",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_compress_file",
    description:
      "Use to reduce the token footprint of an allowed-root markdown file while preserving headings, URLs, and code blocks. Creates a .original.md backup before writing.",
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
      "Use to persist an important insight, decision, or pattern to long-term memory when you discover a reusable pattern, confirm a preference, fix a recurring bug, or make a decision worth remembering across sessions.",
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
    description:
      "Use to get past observations about specific files before editing them, or when investigating how a file was created or modified.",
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
    description:
      "Use to detect recurring patterns across sessions when reviewing a project for repeated bugs, recurring workflows, or common pitfalls worth formalizing as lessons.",
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
      "Use to list recent sessions with their status and observation counts when finding recent work or locating a session ID for targeted recall.",
    inputSchema: {
      type: "object",
      properties: {
        start_time: {
          type: "string",
          description: "Optional inclusive ISO 8601 lower time bound for session lifetime overlap",
        },
        end_time: {
          type: "string",
          description: "Optional inclusive ISO 8601 upper time bound for session lifetime overlap",
        },
        limit: { type: "number", description: "Optional max sessions to return" },
      },
    },
  },
  {
    name: "memory_smart_search",
    description:
      "Use for broad exploratory search when exact terms are uncertain or keyword search returns too little. Hybrid semantic+keyword search returns initial matches; expand with expandIds to get full details.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        expandIds: {
          type: "string",
          description: "Comma-separated observation IDs to expand",
        },
        limit: { type: "number", description: "Max results (default 10)" },
        start_time: {
          type: "string",
          description: "Optional inclusive ISO 8601 lower time bound for observation timestamps",
        },
        end_time: {
          type: "string",
          description: "Optional inclusive ISO 8601 upper time bound for observation timestamps",
        },
        project: {
          type: "string",
          description:
            "Optional opaque canonical project identifier to restrict smart search results.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_vision_search",
    description:
      "Use to find screenshots by description or locate visually similar images from past sessions. Cross-modal search via CLIP embeddings; requires AGENTMEMORY_IMAGE_EMBEDDINGS=true.",
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
    description:
      "Use to see observations around an anchor point when tracing what happened before or after a date, event, or session.",
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
    description:
      "Use to get a project's top concepts and file patterns when starting work in an unfamiliar project or checking common terminology.",
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
    description:
      "Use to export all memory data as JSON for backup, migration to another system, or offline analysis.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "memory_relations",
    description:
      "Use to explore how memories are connected when finding all items related to a concept or tracing a topic through the knowledge graph.",
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
      "Use to look up the agent session that produced a git commit when tracing a code change back to the conversation that created it. Returns commit metadata and linked sessions.",
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
      "Use to list recent commits linked to agent sessions when reviewing recent work or finding commits from a specific effort. Optionally filtered by branch or repo.",
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
      "Use to sync memory between agentmemory and Claude Code when switching between them or keeping both stores consistent.",
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
    description:
      "Use to query the knowledge graph for entities and relationships when exploring connected concepts or discovering relationships between items.",
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
      "Use to transform accumulated observations into structured long-term memories. Run periodically to organize observations into higher-quality episodic, semantic, or procedural memories.",
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
    description:
      "Use to broadcast a memory or observation to other agents on the team. For multi-agent setups.",
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
    description:
      "Use to see what other agents have shared since you last checked. For multi-agent setups.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max items (default 20)" },
      },
    },
  },
  {
    name: "memory_audit",
    description:
      "Use to view the audit trail of memory operations when checking who changed what and when, or debugging unexpected modifications.",
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
    description:
      "Use to delete specific memories with an audit trail when removing incorrect, outdated, or sensitive memories while preserving a deletion record.",
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
    name: "memory_forget",
    description:
      "Use to delete observations, a whole session, or a single memory with audit trail. " +
      "Use this for observation and session cleanup; memory_governance_delete only handles saved memories.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description:
            "Session to delete from. Without observationIds or memoryId, removes all observations plus the session record and summary.",
        },
        observationIds: {
          type: "string",
          description: "Comma-separated observation IDs to delete. Requires sessionId.",
        },
        memoryId: {
          type: "string",
          description: "Single saved memory ID to delete.",
        },
      },
    },
  },
  {
    name: "memory_snapshot_create",
    description:
      "Use to create a git-versioned checkpoint of current memory state before bulk deletes, consolidations, or imports.",
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
      "Use to create an actionable work item with typed dependencies when breaking a task into tracked steps that can be leased, updated, and completed.",
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
      "Use to update an action's status, priority, or details when marking progress on tracked work items. Set status to 'done' to complete it and unblock dependent actions.",
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
      "Use to see all unblocked actions ranked by priority when deciding what to work on next from multiple pending tasks. For a single recommendation, use memory_next instead.",
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
      "Use to get the single most important next action when you want a quick recommendation instead of scanning the full list. To see all available actions, use memory_frontier.",
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
      "Use to claim exclusive ownership of an action and prevent duplicate work across agents. For multi-agent setups.",
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
      "Use to start a predefined multi-step process such as a release checklist or deploy pipeline. Instantiates a frozen routine, creating actions for each step with proper dependencies.",
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
      "Use to send a message to another agent or broadcast for handoffs, requests, or alerts. Supports threading, typed messages, and TTL expiration. For multi-agent setups.",
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
      "Use to read messages sent to an agent at session start or when checking for pending handoffs from other agents. For multi-agent setups.",
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
      "Use to gate action progress on external conditions such as CI results, approvals, or deploy status. Create, resolve, or list checkpoints. For multi-agent or CI-integrated setups.",
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
      "Use to sync memories and actions with peer agentmemory instances to keep memory consistent across separate agent environments. For multi-agent setups.",
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
      "Use to set up an event-driven sentinel that auto-unblocks actions when conditions are met, such as webhook, timer, threshold, pattern, or approval events. For multi-agent or event-driven setups.",
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
      "Use to fire a sentinel from an external source and unblock gated actions. For multi-agent or CI-integrated setups.",
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
      "Use to create an ephemeral action graph for exploratory planning when trying a task breakdown before committing to permanent actions.",
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
      "Use to convert an exploratory sketch into permanent actions after validating a plan and deciding it should become tracked work.",
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
      "Use to compress a completed action chain into a concise summary after finishing a multi-step task. Extracts narrative, key outcomes, files affected, and lessons.",
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
      "Use to run health checks across all subsystems when looking for stuck, orphaned, or inconsistent state. Follow with memory_heal to fix issues.",
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
      "Use to auto-fix issues found by memory_diagnose, such as stuck actions, stale leases, or orphaned data. Pass dryRun=true to preview without changing.",
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
      "Use to attach structured tags (dimension:value) to actions, memories, or observations so they can later be queried with memory_facet_query.",
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
      "Use to find items by facet tags with AND/OR logic after tagging them, such as all items matching priority:urgent AND team:backend.",
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
      "Use to verify a memory or observation by checking its source evidence before relying on it. Returns provenance information including confidence scores.",
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
      "Use to save a lesson learned after discovering a reliable pattern, such as what works in a situation or what to avoid. Confidence strengthens on reinforcement and decays when unused.",
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
      "Use to search saved lessons before starting a task similar to one done before. Returns lessons sorted by confidence and recency.",
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
    name: "memory_lesson_list",
    description:
      "Use to list saved lessons, optionally filtered by project, source, and confidence, when inspecting the lesson store without requiring a search query.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Filter by project" },
        source: {
          type: "string",
          description: "Filter by source: manual, crystal, or consolidation",
        },
        minConfidence: {
          type: "number",
          description: "Minimum confidence threshold (default 0)",
        },
        limit: { type: "number", description: "Max results (default 50)" },
      },
    },
  },
  {
    name: "memory_lesson_strengthen",
    description:
      "Use to strengthen an existing lesson by ID when confirming that a reusable lesson remains relevant.",
    inputSchema: {
      type: "object",
      properties: {
        lessonId: { type: "string", description: "Lesson ID to strengthen" },
      },
      required: ["lessonId"],
    },
  },
  {
    name: "memory_obsidian_export",
    description:
      "Use to export memories, lessons, and crystals as Obsidian-compatible Markdown for manual review, sharing with humans, or archiving in a personal note-taking system.",
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
      "Use to synthesize higher-order insights from accumulated memories when looking for emergent patterns, cross-project themes, or new best practices.",
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
      "Use to list synthesized insights when reviewing what the system has learned about your projects. These are higher-order observations derived from patterns across memories, lessons, and crystals.",
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
      "Use to list all memory slots (pinned, project, and global) when checking what persistent context is available across sessions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "memory_slot_get",
    description:
      "Use to read a single slot by label when checking the current value of a slot like 'persona' or 'pending_items'.",
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
    description:
      "Use to create a named persistent context slot, such as project notes or preferences, that survives across sessions. Rejects if the label already exists.",
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
      "Use to add text to an existing slot without replacing it, such as appending to a running pending-items list. Fails with 413 if append exceeds sizeLimit; compact via memory_slot_replace first.",
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
    description:
      "Use to update a slot's entire content when a persistent context slot needs a fresh state. Fails if content exceeds sizeLimit.",
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
    description:
      "Use to delete a slot when persistent context is obsolete or incorrect. Seeded default slots can be deleted unless marked readOnly.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Slot label" },
      },
      required: ["label"],
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
  ];
}

// Default discovery stays lean for MCP clients with tight tool budgets.
// The full tool surface remains available with AGENTMEMORY_TOOLS=all,
// and tools/call keeps routing registered legacy tools directly.
export function getVisibleTools(): McpToolDef[] {
  const mode = process.env["AGENTMEMORY_TOOLS"] || "core";
  if (mode === "all") return getAllTools();
  return getAllTools().filter((t) => ESSENTIAL_TOOLS.has(t.name));
}
