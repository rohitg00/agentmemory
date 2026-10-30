export interface Session {
  id: string;
  timestamp?: string;
  content: string;
}

export interface Question {
  id: string;
  type: string;
  question: string;
  answer?: string;
  timestamp?: string;
  answerability?: "answerable" | "unanswerable";
  goldSessionIds: string[];
  coalescedSources?: number;
  haystack: Session[];
}

export interface RankedDoc {
  sessionId: string;
  score: number;
  content?: string;
}

export interface Adapter<State = unknown> {
  name: string;
  init(sessions: Session[], config?: Record<string, unknown>): Promise<State>;
  query(q: string, state: State, k: number, timestamp?: string): Promise<RankedDoc[]>;
  teardown?(state: State): Promise<void>;
}

export interface ScoreRow {
  questionId: string;
  questionType: string;
  answerability: "answerable" | "unanswerable";
  adapter: string;
  k: number;
  status: "ok" | "error";
  phase?: "init" | "query" | "teardown";
  error?: string;
  precisionAtK: number | null;
  recallAtK: number | null;
  recallAllAtK: number | null;
  hit: boolean | null;
  returnedCount: number;
  topGoldRank: number | null;
  latencyMs: number;
  ingestionMs: number;
}
