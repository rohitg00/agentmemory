# 01 — Dynamic Project Identity Resolver

**What to build:** Automatic, dynamic resolution of workspace identity across hooks and client plugins so that distinct repositories never collide on memory namespaces even when sharing the same directory name, eliminating the need to manually set or export `AGENTMEMORY_PROJECT_NAME`.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Inquire Git remote `origin` or `upstream` and extract canonical `owner-repo` as the primary `Project Key`.
- [ ] Fall back deterministically to `basename(root)-shortHash(realpath(root))` when no Git remote exists, ensuring local-only workspaces remain isolated.
- [ ] Retain repository basename as `Project Display Name` and root directory as `rootPath` for dashboard rendering.
- [ ] Verify that Git worktrees and secondary clones pointing to the same remote origin resolve to the same canonical `Project Key`.
- [ ] Integrate resolution logic seamlessly into `src/hooks/_project.ts` and `plugin/opencode/agentmemory-capture.ts`.
