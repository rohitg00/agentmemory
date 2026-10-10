export function processStatIsRunning(stat: string): boolean {
  return !stat.trimStart().startsWith("Z");
}
