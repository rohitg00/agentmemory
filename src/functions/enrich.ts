import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type { Memory } from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

const MAX_CONTEXT_LENGTH = 4000;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function registerEnrichFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    {
      id: "mem::enrich",
      description:
        "Aggregate file context, relevant observations, and bug memories for pre-tool enrichment",
    },
    async (data: {
      sessionId: string;
      files: string[];
      terms?: string[];
      toolName?: string;
    }) => {
      const ctx = getContext();
      const parts: string[] = [];

      const fileContextPromise = sdk
        .trigger<{ sessionId: string; files: string[] }, { context: string }>(
          "mem::file-context",
          {
            sessionId: data.sessionId,
            files: data.files,
          },
        )
        .catch(() => ({ context: "" }));

      const searchQueries: string[] = [
        ...data.files.map((f) => f.split("/").pop() || f),
        ...(data.terms || []),
      ].filter((q) => q.length > 0);

      const searchPromise =
        searchQueries.length > 0
          ? sdk
              .trigger<
                { query: string; limit: number },
                { results: Array<{ observation: { narrative: string } }> }
              >("mem::search", {
                query: searchQueries.join(" "),
                limit: 5,
              })
              .catch(() => ({ results: [] }))
          : Promise.resolve({ results: [] });

      const bugMemoriesPromise = kv
        .list<Memory>(KV.memories)
        .then((memories) =>
          memories
            .filter(
              (m) =>
                m.type === "bug" &&
                m.isLatest &&
                m.files.some((f) =>
                  data.files.some((df) => f.includes(df) || df.includes(f)),
                ),
            )
            .sort(
              (a, b) =>
                new Date(b.updatedAt || b.createdAt).getTime() -
                new Date(a.updatedAt || a.createdAt).getTime(),
            ),
        )
        .catch(() => []);

      const [fileContext, searchResult, bugMemories] = await Promise.all([
        fileContextPromise,
        searchPromise,
        bugMemoriesPromise,
      ]);

      if (fileContext.context) {
        parts.push(fileContext.context);
      }

      if (searchResult.results.length > 0) {
        const observations = searchResult.results
          .map((r) => r.observation?.narrative)
          .filter(Boolean)
          .map((n) => escapeXml(n as string))
          .join("\n");
        if (observations) {
          parts.push(
            `<agentmemory-relevant-context>\n${observations}\n</agentmemory-relevant-context>`,
          );
        }
      }

      if (bugMemories.length > 0) {
        const bugs = bugMemories
          .slice(0, 3)
          .map((m) => `- ${escapeXml(m.title)}: ${escapeXml(m.content)}`)
          .join("\n");
        parts.push(
          `<agentmemory-past-errors>\n${bugs}\n</agentmemory-past-errors>`,
        );
      }

      let context = parts.join("\n\n");
      let truncated = false;
      if (context.length > MAX_CONTEXT_LENGTH) {
        context = context.slice(0, MAX_CONTEXT_LENGTH);
        truncated = true;
      }

      ctx.logger.info("Enrichment completed", {
        sessionId: data.sessionId,
        fileCount: data.files.length,
        contextLength: context.length,
        truncated,
      });

      return { context, truncated };
    },
  );
}
