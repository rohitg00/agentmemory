import type { Adapter, RankedDoc, Session } from "../types.js";

interface VectorState {
  sessions: Session[];
  embeddings: Float32Array[];
}

const OPENAI_URL = "https://api.openai.com/v1/embeddings";
const MODEL = "text-embedding-3-small";
const DIM = 1536;

async function embed(text: string, apiKey: string): Promise<Float32Array> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: text, model: MODEL }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embed failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return Float32Array.from(data.data[0].embedding);
}

async function embedBatch(texts: string[], apiKey: string): Promise<Float32Array[]> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: texts, model: MODEL }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI batch embed failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
  if (!Array.isArray(data.data) || data.data.length !== texts.length) {
    throw new Error(
      `OpenAI batch embed: expected ${texts.length} embeddings, got ${data.data?.length ?? 0}`,
    );
  }
  const out = new Array<Float32Array>(texts.length);
  for (const row of data.data) {
    if (
      !Number.isInteger(row.index) ||
      row.index < 0 ||
      row.index >= texts.length ||
      out[row.index] !== undefined
    ) {
      throw new Error(`OpenAI batch embed: invalid or duplicate index ${row.index}`);
    }
    if (!Array.isArray(row.embedding) || row.embedding.length === 0) {
      throw new Error(`OpenAI batch embed: empty embedding at index ${row.index}`);
    }
    out[row.index] = Float32Array.from(row.embedding);
  }
  return out;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export const vectorAdapter: Adapter<VectorState> = {
  name: "vector",
  async init(sessions) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY required for vector adapter");
    const embeddings: Float32Array[] = new Array(sessions.length);
    const BATCH = 50;
    for (let i = 0; i < sessions.length; i += BATCH) {
      const batch = sessions.slice(i, i + BATCH);
      const vecs = await embedBatch(
        batch.map((s) => s.content.slice(0, 8000)),
        apiKey,
      );
      for (let j = 0; j < vecs.length; j++) embeddings[i + j] = vecs[j];
    }
    if (embeddings.length > 0 && embeddings[0].length !== DIM) {
      throw new Error(`unexpected embedding dim: ${embeddings[0].length}`);
    }
    return { sessions, embeddings };
  },
  async query(q, state, k) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY required for vector adapter");
    const qvec = await embed(q, apiKey);
    const scored: RankedDoc[] = state.sessions.map((s, i) => ({
      sessionId: s.id,
      score: cosine(qvec, state.embeddings[i]),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  },
};
