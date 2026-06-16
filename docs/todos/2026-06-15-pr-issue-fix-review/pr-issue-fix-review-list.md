# PR Issue Fix Review List

| Upstream PR | Upstream issue | Fork tracker | Decision | Evidence | Verification | Residual risk |
| --- | --- | --- | --- | --- | --- | --- |
| upstream-pr-412 | upstream-issue-395 | fork-tracker-672 | adapt | Issue evidence shows local embedding configuration used the `AGENTMEMORY_` alias and local package names; PR evidence contained the relevant alias idea but also unrelated MCP/plugin config and an unsafe older provider-detection fallback. | Added focused provider alias tests and adapted only `src/config.ts`; targeted embedding provider suite passes. | The alias is intentionally explicit opt-in; dependency installation for local embeddings remains a separate operator requirement. |
