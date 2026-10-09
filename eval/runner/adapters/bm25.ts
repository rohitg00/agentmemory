import { SearchIndex } from "../../../src/state/search-index.js";
import { sessionText } from "../input.js";
import type { Adapter, Session } from "../types.js";

interface Bm25State {
  index: SearchIndex;
  sessions: Map<string, Session>;
}

export const bm25Adapter: Adapter<Bm25State> = {
  name: "agentmemory-bm25-component",
  async init(sessions) {
    const index = new SearchIndex();
    for (const session of sessions) {
      index.add({
        id: session.id,
        sessionId: session.id,
        timestamp: session.timestamp ?? "1970-01-01T00:00:00.000Z",
        type: "discovery",
        title: "",
        narrative: sessionText(session),
        facts: [],
        concepts: [],
        files: [],
        importance: 5,
      });
    }
    return { index, sessions: new Map(sessions.map((s) => [s.id, s])) };
  },
  async query(query, state, k) {
    return state.index.search(query, k).map((r) => ({
      sessionId: r.sessionId,
      score: r.score,
      content: sessionText(state.sessions.get(r.sessionId)!),
    }));
  },
};
