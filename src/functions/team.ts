import type { ISdk } from "iii-sdk";
import type {
  TeamConfig,
  TeamSharedItem,
  TeamProfile,
  Memory,
} from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";
import { logger } from "../logger.js";

const VALID_ITEM_TYPES = new Set(["memory", "pattern", "observation"]);

export function registerTeamFunction(
  sdk: ISdk,
  kv: StateKV,
  config: TeamConfig,
): void {
  sdk.registerFunction("mem::team-share", 
    async (data: {
      itemId: string;
      itemType: "memory" | "pattern" | "observation";
      sessionId?: string;
      project?: string;
    }) => {
      if (!data) {
        return { success: false, error: "payload required" };
      }
      if (!data.itemId || !data.itemType) {
        return { success: false, error: "itemId and itemType are required" };
      }
      if (!VALID_ITEM_TYPES.has(data.itemType)) {
        return { success: false, error: `Invalid itemType: ${data.itemType}` };
      }

      let content: unknown;
      if (data.itemType === "observation") {
        if (!data.sessionId) {
          return {
            success: false,
            error: "sessionId is required for observations",
          };
        }
        content = await kv.get(KV.observations(data.sessionId), data.itemId);
      } else {
        content = await kv.get<Memory>(KV.memories, data.itemId);
      }
      if (!content) {
        return { success: false, error: "Item not found" };
      }

      const shared: TeamSharedItem = {
        id: generateId("ts"),
        sharedBy: config.userId,
        sharedAt: new Date().toISOString(),
        type: data.itemType,
        content,
        project: data.project || "",
        visibility: "shared",
      };

      await kv.set(KV.teamShared(config.teamId), shared.id, shared);

      await recordAudit(kv, "share", "mem::team-share", [data.itemId], {
        teamId: config.teamId,
        userId: config.userId,
        itemType: data.itemType,
      });

      logger.info("Team share", {
        teamId: config.teamId,
        itemId: data.itemId,
      });
      return { success: true, sharedItem: shared };
    },
  );

  sdk.registerFunction("mem::team-feed", 
    async (data?: { limit?: number }) => {
      const limit = data?.limit ?? 20;
      const items = await kv.list<TeamSharedItem>(KV.teamShared(config.teamId));

      const filtered = items.filter((i) => i.visibility === "shared");
      const sorted = filtered
        .sort(
          (a, b) =>
            new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime(),
        )
        .slice(0, limit);

      return { items: sorted, total: filtered.length };
    },
  );

  sdk.registerFunction("mem::team-profile",  async () => {
    const items = await kv.list<TeamSharedItem>(KV.teamShared(config.teamId));

    const members = [...new Set(items.map((i) => i.sharedBy))];

    const conceptCounts = new Map<string, number>();
    const fileCounts = new Map<string, number>();
    const patterns: string[] = [];

    for (const item of items) {
      if (item.type === "memory" || item.type === "pattern") {
        const mem = item.content as Memory;
        if (mem?.concepts) {
          for (const c of mem.concepts) {
            conceptCounts.set(c, (conceptCounts.get(c) || 0) + 1);
          }
        }
        if (mem?.files) {
          for (const f of mem.files) {
            fileCounts.set(f, (fileCounts.get(f) || 0) + 1);
          }
        }
        if (item.type === "pattern" && mem?.content) {
          patterns.push(mem.content.slice(0, 100));
        }
      }
    }

    const topConcepts = [...conceptCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([concept, frequency]) => ({ concept, frequency }));

    const topFiles = [...fileCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([file, frequency]) => ({ file, frequency }));

    const profile: TeamProfile = {
      teamId: config.teamId,
      members,
      topConcepts,
      topFiles,
      sharedPatterns: patterns.slice(0, 10),
      totalSharedItems: items.length,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(KV.teamProfile(config.teamId), "profile", profile);
    await recordAudit(
      kv,
      "share",
      "mem::team-profile",
      ["profile"],
      {
        teamId: config.teamId,
        members: members.length,
        totalSharedItems: items.length,
      },
      undefined,
      config.userId,
    );
    return profile;
  });
}
