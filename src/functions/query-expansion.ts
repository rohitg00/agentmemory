import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type { MemoryProvider, QueryExpansion } from "../types.js";

const QUERY_EXPANSION_SYSTEM = `You are a query expansion engine for a memory retrieval system. Given a user query, generate diverse reformulations to maximize recall.

Output EXACTLY this XML:
<expansion>
  <reformulations>
    <query>semantically diverse rephrasing 1</query>
    <query>semantically diverse rephrasing 2</query>
    <query>semantically diverse rephrasing 3</query>
  </reformulations>
  <temporal>
    <query>time-concretized version if applicable</query>
  </temporal>
  <entities>
    <entity>extracted entity name 1</entity>
    <entity>extracted entity name 2</entity>
  </entities>
</expansion>

Rules:
- Generate 3-5 reformulations capturing different interpretations
- Include paraphrases, domain-specific restatements, and abstract/concrete variants
- Extract any named entities (people, files, projects, libraries, concepts)
- If the query mentions time ("last week", "recently"), generate temporal concretizations
- Each reformulation should capture a distinct facet of intent
- Keep reformulations concise (under 100 chars each)`;

function parseExpansionXml(xml: string): QueryExpansion | null {
  const reformulations: string[] = [];
  const queryRegex =
    /<reformulations>[\s\S]*?<\/reformulations>/;
  const reformBlock = xml.match(queryRegex);
  if (reformBlock) {
    const qRegex = /<query>([^<]+)<\/query>/g;
    let match;
    while ((match = qRegex.exec(reformBlock[0])) !== null) {
      reformulations.push(match[1].trim());
    }
  }

  const temporalConcretizations: string[] = [];
  const tempBlock = xml.match(/<temporal>[\s\S]*?<\/temporal>/);
  if (tempBlock) {
    const qRegex = /<query>([^<]+)<\/query>/g;
    let match;
    while ((match = qRegex.exec(tempBlock[0])) !== null) {
      temporalConcretizations.push(match[1].trim());
    }
  }

  const entityExtractions: string[] = [];
  const entityRegex = /<entity>([^<]+)<\/entity>/g;
  let match;
  while ((match = entityRegex.exec(xml)) !== null) {
    entityExtractions.push(match[1].trim());
  }

  return {
    original: "",
    reformulations,
    temporalConcretizations,
    entityExtractions,
  };
}

export function registerQueryExpansionFunction(
  sdk: ISdk,
  provider: MemoryProvider,
): void {
  sdk.registerFunction(
    {
      id: "mem::expand-query",
      description:
        "Generate diverse query reformulations for improved recall",
    },
    async (data: { query: string; maxReformulations?: number }) => {
      const ctx = getContext();
      const maxR = data.maxReformulations ?? 5;

      try {
        const response = await provider.compress(
          QUERY_EXPANSION_SYSTEM,
          `Expand this query for memory retrieval:\n\n"${data.query}"`,
        );

        const parsed = parseExpansionXml(response);
        if (!parsed) {
          ctx.logger.warn("Failed to parse query expansion");
          return {
            success: true,
            expansion: {
              original: data.query,
              reformulations: [],
              temporalConcretizations: [],
              entityExtractions: [],
            },
          };
        }

        parsed.original = data.query;
        parsed.reformulations = parsed.reformulations.slice(0, maxR);

        ctx.logger.info("Query expanded", {
          original: data.query,
          reformulations: parsed.reformulations.length,
          entities: parsed.entityExtractions.length,
        });

        return { success: true, expansion: parsed };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.logger.error("Query expansion failed", { error: msg });
        return {
          success: true,
          expansion: {
            original: data.query,
            reformulations: [],
            temporalConcretizations: [],
            entityExtractions: [],
          },
        };
      }
    },
  );
}

export function extractEntitiesFromQuery(query: string): string[] {
  const entities: string[] = [];
  const quoted = query.match(/"([^"]+)"/g);
  if (quoted) {
    for (const q of quoted) {
      entities.push(q.replace(/"/g, ""));
    }
  }
  const capitalized = query.match(/\b[A-Z][a-zA-Z0-9_.-]+\b/g);
  if (capitalized) {
    const stopWords = new Set([
      "The",
      "This",
      "That",
      "What",
      "When",
      "Where",
      "How",
      "Why",
      "Who",
      "Which",
      "Did",
      "Does",
      "Do",
      "Is",
      "Are",
      "Was",
      "Were",
      "Has",
      "Have",
      "Had",
      "Can",
      "Could",
      "Would",
      "Should",
      "Will",
      "May",
      "Might",
      "If",
      "And",
      "But",
      "Or",
      "Not",
      "For",
      "From",
      "With",
      "About",
      "After",
      "Before",
      "Between",
    ]);
    for (const c of capitalized) {
      if (!stopWords.has(c)) entities.push(c);
    }
  }
  return [...new Set(entities)];
}
