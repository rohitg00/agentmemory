import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type { Memory } from "../types.js";
import { KV, generateId } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

export function registerRememberFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::remember" },
    async (data: {
      content: string;
      type?: string;
      concepts?: string[];
      files?: string[];
    }) => {
      const ctx = getContext();
      if (!data.content || !data.content.trim()) {
        return { success: false, error: "content is required" };
      }
      const validTypes = new Set([
        "pattern",
        "preference",
        "architecture",
        "bug",
        "workflow",
        "fact",
      ]);
      const memType = validTypes.has(data.type || "")
        ? (data.type as Memory["type"])
        : "fact";

      const now = new Date().toISOString();
      const memory: Memory = {
        id: generateId("mem"),
        createdAt: now,
        updatedAt: now,
        type: memType,
        title: data.content.slice(0, 80),
        content: data.content,
        concepts: data.concepts || [],
        files: data.files || [],
        sessionIds: [],
        strength: 7,
      };

      await kv.set(KV.memories, memory.id, memory);

      ctx.logger.info("Memory saved", {
        memId: memory.id,
        type: memory.type,
      });
      return { success: true, memory };
    },
  );

  sdk.registerFunction(
    { id: "mem::forget" },
    async (data: {
      sessionId?: string;
      observationIds?: string[];
      memoryId?: string;
    }) => {
      const ctx = getContext();
      let deleted = 0;

      if (data.memoryId) {
        await kv.delete(KV.memories, data.memoryId);
        deleted++;
      }

      if (
        data.sessionId &&
        data.observationIds &&
        data.observationIds.length > 0
      ) {
        for (const obsId of data.observationIds) {
          await kv.delete(KV.observations(data.sessionId), obsId);
          deleted++;
        }
      }

      if (
        data.sessionId &&
        (!data.observationIds || data.observationIds.length === 0) &&
        !data.memoryId
      ) {
        const observations = await kv.list<{ id: string }>(
          KV.observations(data.sessionId),
        );
        for (const obs of observations) {
          await kv.delete(KV.observations(data.sessionId), obs.id);
          deleted++;
        }
        await kv.delete(KV.sessions, data.sessionId);
        await kv.delete(KV.summaries, data.sessionId);
        deleted += 2;
      }

      ctx.logger.info("Memory forgotten", { deleted });
      return { success: true, deleted };
    },
  );
}
