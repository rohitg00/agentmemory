export function formatCompact(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toString();
}
