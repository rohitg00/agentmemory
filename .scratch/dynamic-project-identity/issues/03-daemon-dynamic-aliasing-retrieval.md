# 03 — Daemon Dynamic Aliasing Retrieval

**What to build:** Transparent Dual-Lookup retrieval (Dynamic Aliasing) in the AgentMemory daemon:
1. When context injection (`mem::context`), memory recall (`mem::recall`, `mem::smart-search`), or lesson query is triggered for a workspace, the query searches primarily by the canonical `project_key`.
2. If few or no records are found, the daemon falls back to query legacy records matching `project_display_name` (the legacy folder basename).
3. Guarantees that existing historical memories created before the migration are seamlessly recalled without data loss.

**Blocked by:** 01 — Workspace Identity Resolver

**Status:** resolved

- [x] `mem::context` implements dual-lookup: queries by `project_key`, falls back to `project_display_name` if legacy records exist.
- [x] Memory and lesson recall functions query canonical `project_key` with fallback to `project_display_name`.
- [x] Verification tests confirm that memories created with legacy project names (`Monolith`) are recalled successfully when querying with the new `project_key` (`github.com-myorg-monolith`).
