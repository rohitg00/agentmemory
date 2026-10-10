export type SearchLayer = "all" | "memory" | "observation";
export type SearchResultLayer = "memory" | "observation" | "lesson" | "insight";
export type SearchLayerResolver = (obsId: string, sessionId: string) => SearchResultLayer | undefined;

export function isSearchLayer(value: unknown): value is SearchLayer {
  return value === "all" || value === "memory" || value === "observation";
}

export function isSearchResultLayer(value: unknown): value is SearchResultLayer {
  return value === "memory" || value === "observation" || value === "lesson" || value === "insight";
}

export function getSearchResultLayer(obsId: string, sessionId: string): SearchResultLayer {
  if (obsId.startsWith("mem_")) return "memory";
  if (sessionId === "lesson" || obsId.startsWith("lsn_")) return "lesson";
  if (sessionId === "insight" || obsId.startsWith("ins_")) return "insight";
  return "observation";
}

export function matchesSearchLayer(
  obsId: string,
  sessionId: string,
  targetLayer: SearchLayer = "all",
  layer?: SearchResultLayer,
): boolean {
  return targetLayer === "all" || (layer ?? getSearchResultLayer(obsId, sessionId)) === targetLayer;
}
