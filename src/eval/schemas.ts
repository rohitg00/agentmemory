import { z } from "zod";

const HookTypeEnum = z.enum([
  "session_start",
  "prompt_submit",
  "pre_tool_use",
  "post_tool_use",
  "post_tool_failure",
  "pre_compact",
  "subagent_start",
  "subagent_stop",
  "notification",
  "task_completed",
  "stop",
  "session_end",
]);

const ObservationTypeEnum = z.enum([
  "file_read",
  "file_write",
  "file_edit",
  "command_run",
  "search",
  "web_fetch",
  "conversation",
  "error",
  "decision",
  "discovery",
  "subagent",
  "notification",
  "task",
  "other",
]);

export const ObserveInputSchema = z.object({
  hookType: HookTypeEnum,
  sessionId: z.string().min(1),
  project: z.string().min(1),
  cwd: z.string().min(1),
  timestamp: z.string().min(1),
  data: z.unknown(),
});

export const CompressOutputSchema = z.object({
  type: ObservationTypeEnum,
  title: z.string().min(1).max(120),
  subtitle: z.string().optional(),
  facts: z.array(z.string()).min(1),
  narrative: z.string().min(10),
  concepts: z.array(z.string()),
  files: z.array(z.string()),
  importance: z.number().int().min(1).max(10),
});

export const SummaryOutputSchema = z.object({
  title: z.string().min(1),
  narrative: z.string().min(20),
  keyDecisions: z.array(z.string()),
  filesModified: z.array(z.string()),
  concepts: z.array(z.string()),
});

export const SearchInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

export const ContextInputSchema = z.object({
  sessionId: z.string().min(1),
  project: z.string().min(1),
  budget: z.number().positive().optional(),
});

export const RememberInputSchema = z.object({
  content: z.string().min(1),
  type: z
    .enum(["pattern", "preference", "architecture", "bug", "workflow", "fact"])
    .optional(),
  concepts: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
});

export const SmartSearchInputSchema = z.object({
  query: z.string().optional(),
  expandIds: z.array(z.string()).optional(),
  limit: z.number().int().positive().optional(),
});

export const TimelineInputSchema = z.object({
  anchor: z.string().min(1),
  project: z.string().optional(),
  before: z.number().int().nonnegative().optional(),
  after: z.number().int().nonnegative().optional(),
});

export const ProfileInputSchema = z.object({
  project: z.string().min(1),
  refresh: z.boolean().optional(),
});

export const RelateInputSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  type: z.enum(["supersedes", "extends", "derives", "contradicts", "related"]),
});

export const EvolveInputSchema = z.object({
  memoryId: z.string().min(1),
  newContent: z.string().min(1),
  newTitle: z.string().optional(),
});

export const ExportImportInputSchema = z.object({
  exportData: z.object({
    version: z.literal("0.3.0"),
    exportedAt: z.string(),
    sessions: z.array(z.unknown()),
    observations: z.record(z.string(), z.array(z.unknown())),
    memories: z.array(z.unknown()),
    summaries: z.array(z.unknown()),
    profiles: z.array(z.unknown()).optional(),
  }),
  strategy: z.enum(["merge", "replace", "skip"]).optional(),
});
