import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import type { Facet } from "../types.js";

export function registerFacetsFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::facet-tag" },
    async (data: {
      targetId: string;
      targetType: string;
      dimension: string;
      value: string;
    }) => {
      if (!data.targetId || typeof data.targetId !== "string") {
        return { success: false, error: "targetId is required" };
      }

      const validTypes = ["action", "memory", "observation"];
      if (!validTypes.includes(data.targetType)) {
        return {
          success: false,
          error: `targetType must be one of: ${validTypes.join(", ")}`,
        };
      }

      if (
        !data.dimension ||
        typeof data.dimension !== "string" ||
        data.dimension.trim() === ""
      ) {
        return { success: false, error: "dimension is required" };
      }

      if (
        !data.value ||
        typeof data.value !== "string" ||
        data.value.trim() === ""
      ) {
        return { success: false, error: "value is required" };
      }

      const dimension = data.dimension.trim();
      const value = data.value.trim();

      const existing = await kv.list<Facet>(KV.facets);
      const duplicate = existing.find(
        (f) =>
          f.targetId === data.targetId &&
          f.dimension === dimension &&
          f.value === value,
      );
      if (duplicate) {
        return { success: true, facet: duplicate, skipped: true };
      }

      const facet: Facet = {
        id: generateId("fct"),
        targetId: data.targetId,
        targetType: data.targetType as Facet["targetType"],
        dimension,
        value,
        createdAt: new Date().toISOString(),
      };

      await kv.set(KV.facets, facet.id, facet);
      return { success: true, facet };
    },
  );

  sdk.registerFunction(
    { id: "mem::facet-untag" },
    async (data: {
      targetId: string;
      dimension: string;
      value?: string;
    }) => {
      if (!data.targetId) {
        return { success: false, error: "targetId is required" };
      }
      if (!data.dimension) {
        return { success: false, error: "dimension is required" };
      }

      const all = await kv.list<Facet>(KV.facets);
      const matches = all.filter((f) => {
        if (f.targetId !== data.targetId || f.dimension !== data.dimension) {
          return false;
        }
        if (data.value !== undefined) {
          return f.value === data.value;
        }
        return true;
      });

      for (const f of matches) {
        await kv.delete(KV.facets, f.id);
      }

      return { success: true, removed: matches.length };
    },
  );

  sdk.registerFunction(
    { id: "mem::facet-query" },
    async (data: {
      matchAll?: string[];
      matchAny?: string[];
      targetType?: string;
      limit?: number;
    }) => {
      if (
        (!data.matchAll || data.matchAll.length === 0) &&
        (!data.matchAny || data.matchAny.length === 0)
      ) {
        return {
          success: false,
          error: "at least one of matchAll or matchAny is required",
        };
      }

      const all = await kv.list<Facet>(KV.facets);
      const filtered = data.targetType
        ? all.filter((f) => f.targetType === data.targetType)
        : all;

      const targetFacetMap = new Map<string, { targetType: string; facetKeys: Set<string> }>();
      for (const f of filtered) {
        const key = `${f.dimension}:${f.value}`;
        let entry = targetFacetMap.get(f.targetId);
        if (!entry) {
          entry = { targetType: f.targetType, facetKeys: new Set() };
          targetFacetMap.set(f.targetId, entry);
        }
        entry.facetKeys.add(key);
      }

      const results: Array<{ targetId: string; targetType: string; matchedFacets: string[] }> = [];

      for (const [targetId, entry] of targetFacetMap) {
        const matched: string[] = [];

        if (data.matchAll && data.matchAll.length > 0) {
          const allPresent = data.matchAll.every((k) => entry.facetKeys.has(k));
          if (!allPresent) continue;
          for (const k of data.matchAll) {
            if (!matched.includes(k)) matched.push(k);
          }
        }

        if (data.matchAny && data.matchAny.length > 0) {
          const anyPresent = data.matchAny.filter((k) => entry.facetKeys.has(k));
          if (anyPresent.length === 0) continue;
          for (const k of anyPresent) {
            if (!matched.includes(k)) matched.push(k);
          }
        }

        results.push({
          targetId,
          targetType: entry.targetType,
          matchedFacets: matched,
        });
      }

      const limit = data.limit || 50;
      return { success: true, results: results.slice(0, limit) };
    },
  );

  sdk.registerFunction(
    { id: "mem::facet-get" },
    async (data: { targetId: string }) => {
      if (!data.targetId) {
        return { success: false, error: "targetId is required" };
      }

      const all = await kv.list<Facet>(KV.facets);
      const targetFacets = all.filter((f) => f.targetId === data.targetId);

      const dimMap = new Map<string, string[]>();
      for (const f of targetFacets) {
        let values = dimMap.get(f.dimension);
        if (!values) {
          values = [];
          dimMap.set(f.dimension, values);
        }
        values.push(f.value);
      }

      const dimensions = Array.from(dimMap.entries()).map(([dimension, values]) => ({
        dimension,
        values,
      }));

      return { success: true, dimensions };
    },
  );

  sdk.registerFunction(
    { id: "mem::facet-stats" },
    async (data: { targetType?: string }) => {
      const all = await kv.list<Facet>(KV.facets);
      const filtered = data.targetType
        ? all.filter((f) => f.targetType === data.targetType)
        : all;

      const dimMap = new Map<string, Map<string, number>>();
      for (const f of filtered) {
        let valueMap = dimMap.get(f.dimension);
        if (!valueMap) {
          valueMap = new Map();
          dimMap.set(f.dimension, valueMap);
        }
        valueMap.set(f.value, (valueMap.get(f.value) || 0) + 1);
      }

      const dimensions = Array.from(dimMap.entries()).map(([dimension, valueMap]) => ({
        dimension,
        values: Array.from(valueMap.entries()).map(([value, count]) => ({
          value,
          count,
        })),
      }));

      return { success: true, dimensions, totalFacets: filtered.length };
    },
  );

  sdk.registerFunction(
    { id: "mem::facet-dimensions" },
    async () => {
      const all = await kv.list<Facet>(KV.facets);

      const counts = new Map<string, number>();
      for (const f of all) {
        counts.set(f.dimension, (counts.get(f.dimension) || 0) + 1);
      }

      const dimensions = Array.from(counts.entries()).map(([dimension, count]) => ({
        dimension,
        count,
      }));

      return { success: true, dimensions };
    },
  );
}
