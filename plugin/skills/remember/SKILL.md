---
name: remember
description: Save an insight, decision, or learning to agentmemory's long-term storage with searchable concept tags. Use when the user says "remember this", "save this", "note that", "don't forget", or wants to preserve knowledge for future sessions.
argument-hint: "[what to remember]"
user-invocable: true
---

The user wants to save this to long-term memory: $ARGUMENTS

## Quick start

```json
memory_save {
  "content": "We rotate JWT refresh tokens on every use; the old token is revoked server-side in auth/refresh.ts.",
  "concepts": "jwt-refresh-rotation, token-revocation, auth-flow",
  "files": "src/auth/refresh.ts"
}
```

Expected output:

```text
Saved memory abc12345 with 3 concepts: jwt-refresh-rotation, token-revocation, auth-flow.
```

## Why

A memory is only as useful as the terms that retrieve it. Tag with specific
concepts so a future `recall` finds it, and preserve the user's meaning without
persisting raw credentials or secrets.

## Workflow

1. Pull the core insight, decision, or fact out of `$ARGUMENTS`.
2. Inspect the content for credentials, API keys, bearer tokens, passwords,
   private keys, session cookies, one-time codes, or other secrets. Replace raw
   values with descriptive placeholders such as `[REDACTED_GITHUB_TOKEN]`.
3. Extract 2-5 lowercased concept phrases. Prefer specific over generic
   (`jwt-refresh-rotation` beats `auth`).
4. Extract referenced file paths (absolute or repo-relative). Empty if none.
5. Call `memory_save` with sanitized `content`, `concepts` (comma-separated string), and
   `files` (comma-separated string).
6. Confirm the save and echo the concepts so the user knows the retrieval terms.
   Do not echo secret values.

## Anti-patterns

WRONG: `concepts: "stuff, code, notes"` (generic tags nothing can find later).

RIGHT: `concepts: "jwt-refresh-rotation, token-revocation"` (specific, retrievable).

## Checklist

- Content preserves the user's meaning and non-sensitive phrasing.
- Raw secrets are removed from `content`, `concepts`, `files`, and confirmation.
- Concepts are specific, lowercased, 2-5 items.
- File paths are real references, not guesses.
- Confirmation echoes the exact concepts tagged.

## See also

- `recall`: retrieve what you save here (the pair to this skill).
- `forget`: remove a memory you saved by mistake.

## Troubleshooting

See ../_shared/TROUBLESHOOTING.md if `memory_save` is not available.
