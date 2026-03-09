import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import type { Signal } from "../types.js";

export function registerSignalsFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::signal-send" },
    async (data: {
      from: string;
      to?: string;
      content: string;
      type?: Signal["type"];
      threadId?: string;
      replyTo?: string;
      metadata?: Record<string, unknown>;
      expiresInMs?: number;
    }) => {
      if (!data.from?.trim() || !data.content?.trim()) {
        return { success: false, error: "from and non-empty content are required" };
      }

      const now = new Date();
      let threadId = data.threadId;

      if (data.replyTo && !threadId) {
        const parent = await kv.get<Signal>(KV.signals, data.replyTo);
        if (parent) {
          threadId = parent.threadId || parent.id;
        }
      }

      const signal: Signal = {
        id: generateId("sig"),
        from: data.from,
        to: data.to,
        content: data.content.trim(),
        type: data.type || "info",
        threadId: threadId || generateId("thr"),
        replyTo: data.replyTo,
        metadata: data.metadata,
        createdAt: now.toISOString(),
        expiresAt: data.expiresInMs
          ? new Date(now.getTime() + data.expiresInMs).toISOString()
          : undefined,
      };

      await kv.set(KV.signals, signal.id, signal);

      return { success: true, signal };
    },
  );

  sdk.registerFunction(
    { id: "mem::signal-read" },
    async (data: {
      agentId: string;
      unreadOnly?: boolean;
      threadId?: string;
      type?: string;
      limit?: number;
    }) => {
      if (!data.agentId) {
        return { success: false, error: "agentId is required" };
      }

      let signals = await kv.list<Signal>(KV.signals);
      const now = Date.now();

      signals = signals.filter((s) => {
        if (s.expiresAt && new Date(s.expiresAt).getTime() <= now) return false;
        if (s.to && s.to !== data.agentId && s.from !== data.agentId)
          return false;
        if (!s.to && s.from !== data.agentId) return true;
        return true;
      });

      if (data.unreadOnly) {
        signals = signals.filter((s) => !s.readAt && s.to === data.agentId);
      }
      if (data.threadId) {
        signals = signals.filter((s) => s.threadId === data.threadId);
      }
      if (data.type) {
        signals = signals.filter((s) => s.type === data.type);
      }

      signals.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const limit = data.limit || 50;
      const results = signals.slice(0, limit);

      for (const sig of results) {
        if (!sig.readAt && sig.to === data.agentId) {
          sig.readAt = new Date().toISOString();
          await kv.set(KV.signals, sig.id, sig);
        }
      }

      return { success: true, signals: results };
    },
  );

  sdk.registerFunction(
    { id: "mem::signal-threads" },
    async (data: { agentId: string; limit?: number }) => {
      if (!data.agentId) {
        return { success: false, error: "agentId is required" };
      }

      const signals = await kv.list<Signal>(KV.signals);
      const now = Date.now();

      const relevant = signals.filter((s) => {
        if (s.expiresAt && new Date(s.expiresAt).getTime() <= now) return false;
        return (
          s.from === data.agentId ||
          s.to === data.agentId ||
          !s.to
        );
      });

      const threadMap = new Map<
        string,
        { threadId: string; messages: number; lastMessage: string; participants: Set<string> }
      >();

      for (const sig of relevant) {
        const tid = sig.threadId || sig.id;
        const existing = threadMap.get(tid);
        if (existing) {
          existing.messages++;
          existing.participants.add(sig.from);
          if (sig.to) existing.participants.add(sig.to);
          if (new Date(sig.createdAt) > new Date(existing.lastMessage)) {
            existing.lastMessage = sig.createdAt;
          }
        } else {
          const participants = new Set<string>([sig.from]);
          if (sig.to) participants.add(sig.to);
          threadMap.set(tid, {
            threadId: tid,
            messages: 1,
            lastMessage: sig.createdAt,
            participants,
          });
        }
      }

      const threads = Array.from(threadMap.values())
        .map((t) => ({
          ...t,
          participants: Array.from(t.participants),
        }))
        .sort(
          (a, b) =>
            new Date(b.lastMessage).getTime() -
            new Date(a.lastMessage).getTime(),
        )
        .slice(0, data.limit || 20);

      return { success: true, threads };
    },
  );

  sdk.registerFunction(
    { id: "mem::signal-cleanup" },
    async () => {
      const signals = await kv.list<Signal>(KV.signals);
      const now = Date.now();
      let removed = 0;

      for (const sig of signals) {
        if (sig.expiresAt && new Date(sig.expiresAt).getTime() <= now) {
          await kv.delete(KV.signals, sig.id);
          removed++;
        }
      }

      return { success: true, removed };
    },
  );
}
