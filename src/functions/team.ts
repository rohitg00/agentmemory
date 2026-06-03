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
import { resolveTeamId, resolveUserId } from "../config.js";

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
      userId?: string;
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

      const teamId = resolveTeamId() ?? config.teamId;
      // Private mode: force sharedBy to the configured userId.
      // Prevents impersonation — users can only share as themselves.
      const userId = config.mode === "private"
        ? config.userId
        : (resolveUserId(data.userId) ?? config.userId);

      const shared: TeamSharedItem = {
        id: generateId("ts"),
        sharedBy: userId,
        sharedAt: new Date().toISOString(),
        type: data.itemType,
        content,
        project: data.project || "",
        visibility: "shared",
      };

      await kv.set(KV.teamShared(teamId), shared.id, shared);

      await recordAudit(kv, "share", "mem::team-share", [data.itemId], {
        teamId,
        userId,
        itemType: data.itemType,
      });

      logger.info("Team share", {
        teamId,
        itemId: data.itemId,
      });
      return { success: true, sharedItem: shared };
    },
  );

  sdk.registerFunction("mem::team-feed", 
    async (data?: { limit?: number; userId?: string }) => {
      const limit = data?.limit ?? 20;
      const teamId = resolveTeamId() ?? config.teamId;
      const items = await kv.list<TeamSharedItem>(KV.teamShared(teamId));

      let filtered = items.filter((i) => i.visibility === "shared");

      // Private mode: only show items shared by the configured user.
      // Body userId is ignored — prevents reading other users' items.
      if (config.mode === "private") {
        filtered = filtered.filter((i) => i.sharedBy === config.userId);
      }

      const sorted = filtered
        .sort(
          (a, b) =>
            new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime(),
        )
        .slice(0, limit);

      return { items: sorted, total: filtered.length };
    },
  );

  sdk.registerFunction("mem::team-profile",  async (data?: { userId?: string }) => {
    const teamId = resolveTeamId() ?? config.teamId;
    let items = await kv.list<TeamSharedItem>(KV.teamShared(teamId));

    // Private mode: only profile the configured user's activity.
    // Body userId is ignored — prevents reading other users' profiles.
    if (config.mode === "private") {
      items = items.filter((i) => i.sharedBy === config.userId);
    }

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
      teamId,
      members,
      topConcepts,
      topFiles,
      sharedPatterns: patterns.slice(0, 10),
      totalSharedItems: items.length,
      updatedAt: new Date().toISOString(),
    };

    const auditActor = resolveUserId(data?.userId) ?? config.userId;

    await kv.set(KV.teamProfile(teamId), "profile", profile);
    await recordAudit(
      kv,
      "share",
      "mem::team-profile",
      ["profile"],
      {
        teamId,
        members: members.length,
        totalSharedItems: items.length,
      },
      undefined,
      auditActor,
    );
    return profile;
  });
}
