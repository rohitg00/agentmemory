# remember worked examples

## 1. Saving a decision

User: "Remember that we decided to drop Redis and use the iii-engine state store for session caching."

Invocation:

```json
memory_save {
  "content": "We decided to drop Redis and use the iii-engine state store for session caching to remove a moving part.",
  "concepts": "session-caching, iii-state-store, dropped-redis",
  "files": ""
}
```

Response:

```json
{ "id": "7f3a9c21", "concepts": ["session-caching", "iii-state-store", "dropped-redis"], "saved": true }
```

Present:

> Saved. Tagged it `session-caching`, `iii-state-store`, `dropped-redis`, so a
> later recall on caching or Redis will surface this decision.

## 2. Saving a code-specific gotcha

User: "Save this: the rate limiter in middleware/limit.ts counts per-IP, not per-user, so logged-in users on shared IPs collide."

Invocation:

```json
memory_save {
  "content": "The rate limiter in middleware/limit.ts counts per-IP, not per-user, so logged-in users on shared IPs collide.",
  "concepts": "rate-limiter, per-ip-bug, shared-ip-collision",
  "files": "src/middleware/limit.ts"
}
```

Response:

```json
{ "id": "b21d004e", "concepts": ["rate-limiter", "per-ip-bug", "shared-ip-collision"], "saved": true }
```

Present:

> Saved memory `b21d004e` referencing `src/middleware/limit.ts`. Concepts:
> `rate-limiter`, `per-ip-bug`, `shared-ip-collision`.

## 3. Vague request, no files

User: "Remember this for later."

Ask once for the substance, then save:

```json
memory_save {
  "content": "Staging deploys must run the migration job before the app rollout, never after.",
  "concepts": "staging-deploy, migration-ordering, rollout-sequence",
  "files": ""
}
```

Present the confirmation with the concepts echoed back.
