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
  goldSessionIds: string[];
  haystack: Session[];
}

export interface RankedDoc {
  sessionId: string;
  score: number;
}

export interface Adapter<State = unknown> {
  name: string;
  init(sessions: Session[], config?: Record<string, unknown>): Promise<State>;
  query(q: string, state: State, k: number): Promise<RankedDoc[]>;
  teardown?(state: State): Promise<void>;
}

export interface ScoreRow {
  questionId: string;
  questionType: string;
  adapter: string;
  k: number;
  precisionAtK: number;
  recallAtK: number;
  hit: boolean;
  topGoldRank: number | null;
  latencyMs: number;
}
