# 04 — Gradual Self-Healing Consolidation

**What to build:** Opportunistic migration (Gradual Self-Healing) in the AgentMemory consolidation pipeline:
1. When consolidation (`mem::consolidate`), reflection (`mem::reflect`), or crystallization runs for a workspace, it detects legacy memories still tagged with the un-scoped `project_display_name`.
2. The consolidation routine re-tags these legacy records to the canonical `project_key` as part of the normal consolidation write cycle.
3. Completely avoids cold database migrations, table locking, or batch downtime.

**Blocked by:** 02 — Client Hooks and Monorepo Subpackage Tagging, 03 — Daemon Dynamic Aliasing Retrieval

**Status:** resolved

- [x] `mem::consolidate` inspects memories matching `project_display_name` and updates their project field to `project_key`.
- [x] `mem::reflect` includes legacy records in concept clustering and outputs synthesized insights tagged with `project_key`.
- [x] End-to-end test confirms that legacy records are gracefully migrated to the canonical `project_key` after consolidation.
