import { stem } from "./stemmer.js";

const SYNONYM_GROUPS: string[][] = [
  ["auth", "authentication", "authn", "authenticating"],
  ["authz", "authorization", "authorizing"],
  ["db", "database", "datastore"],
  ["perf", "performance", "latency", "throughput", "slow", "bottleneck"],
  ["optim", "optimization", "optimizing", "optimise", "query-optimization"],
  ["k8s", "kubernetes", "kube"],
  ["config", "configuration", "configuring", "setup"],
  ["deps", "dependencies", "dependency"],
  ["env", "environment"],
  ["fn", "function"],
  ["impl", "implementation", "implementing"],
  ["msg", "message", "messaging"],
  ["repo", "repository"],
  ["req", "request"],
  ["res", "response"],
  ["ts", "typescript"],
  ["js", "javascript"],
  ["pg", "postgres", "postgresql"],
  ["err", "error", "errors"],
  ["api", "endpoint", "endpoints"],
  ["ci", "continuous-integration"],
  ["cd", "continuous-deployment"],
  ["test", "testing", "tests"],
  ["doc", "documentation", "docs"],
  ["infra", "infrastructure"],
  ["deploy", "deployment", "deploying"],
  ["cache", "caching", "cached"],
  ["log", "logging", "logs"],
  ["monitor", "monitoring"],
  ["observe", "observability"],
  ["sec", "security", "secure"],
  ["validate", "validation", "validating"],
  ["migrate", "migration", "migrations"],
  ["debug", "debugging"],
  ["container", "containerization", "docker"],
  ["crash", "crashloop", "crashloopbackoff"],
  ["webhook", "webhooks", "callback"],
  ["middleware", "mw"],
  ["paginate", "pagination"],
  ["serialize", "serialization"],
  ["encrypt", "encryption"],
  ["hash", "hashing"],
];

const synonymMap = new Map<string, Set<string>>();

for (const group of SYNONYM_GROUPS) {
  const stemmed = group.map(t => stem(t.toLowerCase()));
  for (const s of stemmed) {
    if (!synonymMap.has(s)) synonymMap.set(s, new Set());
    for (const other of stemmed) {
      if (other !== s) synonymMap.get(s)!.add(other);
    }
  }
}

export function getSynonyms(stemmedTerm: string): string[] {
  const syns = synonymMap.get(stemmedTerm);
  return syns ? [...syns] : [];
}
