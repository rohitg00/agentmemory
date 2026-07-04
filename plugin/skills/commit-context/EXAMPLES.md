# commit-context worked examples

## 1. Line range with a linked session

User: "Why is this retry loop here?" (pointing at lines 40-52 of refresh.ts)

Find the SHA:

```bash
git blame -L 40,52 src/auth/refresh.ts
# 9a1b2c3d (dev 2026-06-07) ... retry on revoked token
```

Look it up:

```json
memory_commit_lookup { "sha": "9a1b2c3d4e5f60718293a4b5c6d7e8f901234567" }
```

Response:

```json
{
  "commit": { "sha": "9a1b2c3d...", "short": "9a1b2c3", "branch": "main",
    "author": "dev", "message": "rotate refresh tokens" },
  "sessions": [ { "id": "7f3a9c21", "project": "app", "observationCount": 14,
    "summary": "Reworked refresh rotation" } ]
}
```

Present:

> `9a1b2c3` on `main` by dev: "rotate refresh tokens". Linked to session
> `7f3a9c2` "Auth refresh rework" (14 obs). The retry loop handles a token
> revoked mid-flight, per the session's high-importance observations.

## 2. Function lookup, commit predates linking

User: "What was the agent doing when it wrote validateScope?"

```bash
git log -L :validateScope:src/auth/scope.ts -n 1
# 1122aabb ...
```

```json
memory_commit_lookup { "sha": "1122aabbccddeeff00112233445566778899aabb" }
```

Response:

```json
{ "commit": null }
```

Present:

> `1122aab` predates agent session linking, so there is no recorded session.
> From `git show`: it added `validateScope` to enforce per-token scopes. I can
> show the full diff if useful.

## 3. Bare path

User: "Give me context on src/middleware/limit.ts."

```bash
git log -n 1 -- src/middleware/limit.ts
```

Take the SHA, run `memory_commit_lookup`, present commit plus linked session in
the same shape as example 1.
