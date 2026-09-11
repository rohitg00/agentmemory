# 06 — Monorepo Subpath Tagging and End-to-End Integration

**What to build:** Monorepo package directory detection with subpath observation tagging coupled with comprehensive end-to-end integration tests verifying dynamic project isolation, 500+ observation sessions, and working context enrichment.

**Blocked by:** 01 — Dynamic Project Identity Resolver, 05 — Bounded Working Context Assembly

**Status:** ready-for-agent

- [ ] Inspect working directory against Git toplevel root to detect subpackages (e.g. `packages/auth`) and tag incoming observations with `subpath` metadata.
- [ ] Ensure monorepo subpackages inherit shared project ADRs, conventions, and lessons under the root `Project Key`.
- [ ] Write end-to-end integration test validating that two distinct repos named `Monolith` remain completely isolated.
- [ ] Write end-to-end integration test validating a continuous session exceeding 500 observations with background micro-compaction and bounded context assembly.
- [ ] Verify test suite passes cleanly across all test files (`npm test`).
