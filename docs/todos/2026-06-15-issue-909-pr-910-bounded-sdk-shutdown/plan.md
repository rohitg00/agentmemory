# Bounded SDK Shutdown Review Plan

> **For agentic workers:** This plan is executed inline in this session because the current delegation asks for end-to-end review, possible minimal import, verification, documentation, and merge prep in one pass.

**Goal:** Resolve the local fork decision for Issue 909 and PR 910.

**Architecture:** The likely touched surface is application shutdown in `src/index.ts`, where iii-sdk lifecycle calls should not let telemetry shutdown block process exit indefinitely. Tests should mock iii-sdk and exercise the shutdown seam without reaching real engine or telemetry services.

**Tech Stack:** TypeScript, ESM, vitest, iii-sdk mock patterns.

---

## Steps

- [x] Map current shutdown and signal paths.
- [x] Inspect public/read-only PR 910 diff as untrusted input.
- [x] Write or identify a narrow reproduction for a never-resolving shutdown promise.
- [x] Implement only the minimal bounded shutdown behavior if current fork remains vulnerable.
- [x] Run targeted tests, lint/type-relevant checks as appropriate, and required security gates.
- [x] Update this task record with decision, evidence, and caveats.
- [ ] Update this task record with the prep-merge result.
