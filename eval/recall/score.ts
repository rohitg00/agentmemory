export interface RecallBenchmarkCase {
  id: string;
  query: string;
  projectId: string;
  expectedMemoryIds: string[];
  forbiddenMemoryIds: string[];
  maxAcceptableTokens: number;
}

export interface RecallBenchmarkResult {
  selectedIds: string[];
  injectedTokens: number;
  duplicateIds?: string[];
  staleIds?: string[];
}

export function scoreRecallBenchmark(
  cases: RecallBenchmarkCase[],
  results: Record<string, RecallBenchmarkResult>,
) {
  let expected = 0;
  let correct = 0;
  let selected = 0;
  let contamination = 0;
  let budgetViolations = 0;
  let duplicates = 0;
  let stale = 0;
  let tokens = 0;
  for (const testCase of cases) {
    const result = results[testCase.id];
    if (!result) continue;
    const chosen = new Set(result.selectedIds);
    expected += testCase.expectedMemoryIds.length;
    correct += testCase.expectedMemoryIds.filter((id) => chosen.has(id)).length;
    selected += result.selectedIds.length;
    contamination += testCase.forbiddenMemoryIds.filter((id) => chosen.has(id)).length;
    budgetViolations += result.injectedTokens > testCase.maxAcceptableTokens ? 1 : 0;
    duplicates += result.duplicateIds?.length || 0;
    stale += result.staleIds?.length || 0;
    tokens += result.injectedTokens;
  }
  return {
    precision: selected ? correct / selected : 0,
    hitRate: expected ? correct / expected : 0,
    crossProjectContaminationRate: selected ? contamination / selected : 0,
    averageInjectedTokens: cases.length ? tokens / cases.length : 0,
    duplicateInjectionRate: selected ? duplicates / selected : 0,
    staleMemoryRate: selected ? stale / selected : 0,
    budgetViolations,
  };
}
