import type { HybridSearchResult } from "../types.js";

const MODEL = "Xenova/ms-marco-MiniLM-L-6-v2";
const MAX_TOKENS = 512;
const LOAD_RETRY_MS = 60_000;
type ScorePair = (query: string, document: string) => Promise<number>;

let scorer: ScorePair | null = null;
let scorerLoading: Promise<ScorePair | null> | null = null;
let retryAfter = 0;

async function loadScorer(): Promise<ScorePair | null> {
  if (scorer) return scorer;
  if (scorerLoading) return scorerLoading;
  if (Date.now() < retryAfter) return null;

  scorerLoading = (async () => {
    try {
      const { AutoTokenizer, AutoModelForSequenceClassification, Tensor } = await import(
        "@huggingface/transformers"
      );
      const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
      const model = await AutoModelForSequenceClassification.from_pretrained(MODEL, { dtype: "q8" });
      scorer = async (query, document) => {
        const encoded = tokenizer(query, {
          text_pair: document,
          return_tensor: false,
          return_token_type_ids: true,
        });
        const length = encoded.input_ids.length;
        const boundary = encoded.token_type_ids.indexOf(1);
        if (boundary < 2 || boundary >= length) throw new Error("Invalid BERT pair encoding");

        // This model uses [CLS] query [SEP] document [SEP]. Transformers.js
        // slices combined sequences, so truncate content while retaining both segments.
        let queryLength = boundary - 2;
        let documentLength = length - boundary - 1;
        while (queryLength + documentLength > MAX_TOKENS - 3) {
          if (queryLength > documentLength) queryLength--;
          else documentLength--;
        }
        const inputs = Object.fromEntries(Object.entries(encoded).map(([key, values]) => {
          const tokens = [
            ...values.slice(0, queryLength + 1), values[boundary - 1],
            ...values.slice(boundary, boundary + documentLength), values[length - 1],
          ];
          return [key, new Tensor("int64", BigInt64Array.from(tokens, BigInt), [1, tokens.length])];
        }));
        const { logits } = await model(inputs);
        if (logits?.dims.length !== 2 || logits.dims[0] !== 1 || logits.dims[1] !== 1
          || logits.data.length !== 1 || !Number.isFinite(logits.data[0])) {
          throw new Error("Invalid cross-encoder score");
        }
        return Number(logits.data[0]);
      };
      return scorer;
    } catch {
      retryAfter = Date.now() + LOAD_RETRY_MS;
      return null;
    } finally {
      scorerLoading = null;
    }
  })();
  return scorerLoading;
}

export async function rerank(
  query: string,
  results: HybridSearchResult[],
  topK = 20,
): Promise<HybridSearchResult[]> {
  if (results.length <= 1 || !query.trim() || !Number.isSafeInteger(topK) || topK <= 1) return results;

  const scorePair = await loadScorer();
  if (!scorePair) return results;
  const candidates = results.slice(0, topK);
  const scores: Array<{ result: HybridSearchResult; score: number; position: number }> = [];
  try {
    for (const [position, result] of candidates.entries()) {
      const document = `${result.observation.title || ""} ${result.observation.narrative || ""}`.trim();
      scores.push({ result, score: await scorePair(query, document), position });
    }
  } catch {
    // A partially scored window cannot compare model logits with hybrid scores.
    return results;
  }
  scores.sort((a, b) => b.score - a.score || a.position - b.position);
  return scores.map(({ result, score }, i) => ({
    ...result,
    rerankScore: score,
    rerankPosition: i + 1,
  })).concat(results.slice(candidates.length));
}

export function isRerankerAvailable(): boolean {
  return scorer !== null;
}
