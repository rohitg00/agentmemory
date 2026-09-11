# 02 — Dual-Lookup Fallback for Memory Recall

**What to build:** Transparent fallback retrieval that queries memories by canonical `Project Key` first, and if empty or insufficient, queries by the legacy un-scoped project basename so historical sessions and decisions remain accessible without requiring database migrations.

**Blocked by:** 01 — Dynamic Project Identity Resolver

**Status:** ready-for-agent

- [ ] Implement dual-query resolution in memory recall, smart search, and slot retrieval endpoints.
- [ ] Ensure primary lookups against `Project Key` return immediately if matching records exist.
- [ ] Execute fallback lookup against legacy `Project Display Name` (basename) when primary results are empty.
- [ ] Deduplicate results across both lookups to prevent duplicate memory entries in context.
- [ ] Add unit tests verifying both new partitioned lookups and legacy fallback records.
