# 02 — Client Hooks and Monorepo Subpackage Tagging

**What to build:** Client hooks (`src/hooks/*`) and OpenCode plugin (`plugin/opencode/agentmemory-capture.ts`) dispatching the resolved `WorkspaceIdentity`:
1. Hook payloads populate `project: identity.projectKey` and `project_display_name: identity.displayName`.
2. When operating inside a subfolder or package of a Monorepo, the episodic observation metadata includes `subpackage: <relative-path-from-git-root>`.
3. In-memory caching ensures that frequent hook triggers (e.g. `pre-tool-use`, `post-tool-use`) do not cause perceptible lag.

**Blocked by:** 01 — Workspace Identity Resolver

**Status:** resolved

- [x] `src/hooks/_project.ts` and `session-start.ts` integrate the Workspace Identity resolver.
- [x] `plugin/opencode/agentmemory-capture.ts` updates session project and observation payloads to use `identity.projectKey` and `identity.displayName`.
- [x] Working inside a nested directory of a Git repository records `subpackage` metadata tag on episodic observations while keeping root `project_key`.
- [x] Verifies via end-to-end integration tests that hook payloads are dispatched with the correct canonical key and metadata.
