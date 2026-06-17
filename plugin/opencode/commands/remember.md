Explicitly save an insight, decision, or learning to agentmemory for future sessions. Wraps the `memory_save` MCP tool.

## Usage

```
/remember [what to remember]
```

## Instructions

1. Analyze what needs to be remembered — extract the core insight, decision, or fact.
2. Inspect the content for credentials, API keys, bearer tokens, passwords, private keys, session cookies, one-time codes, or other secrets. Replace raw values with descriptive placeholders such as `[REDACTED_GITHUB_TOKEN]`.
3. Extract 2-5 searchable concepts (lowercased keyword phrases). Prefer specific terms ("jwt-refresh-rotation" over "auth").
4. Extract relevant file paths the memory references.
5. Call `memory_save` with:
   - `content` — text to remember that preserves meaning and non-sensitive phrasing, with raw secrets replaced by placeholders
   - `concepts` — extracted concept list
   - `files` — extracted file list (empty array if none)
   - `type` — choose from: pattern, preference, architecture, bug, workflow, fact
6. Confirm the save and show the concepts tagged so the user knows retrieval terms. Do not echo secret values.
