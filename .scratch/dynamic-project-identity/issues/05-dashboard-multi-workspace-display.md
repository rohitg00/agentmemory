# 05 — Dashboard Multi-Workspace Display

**What to build:** Updates to the AgentMemory Web Viewer (`src/viewer/index.html`):
1. Renders the friendly `project_display_name` (e.g. `Monolith`) as the primary visual label on session cards and overview headers.
2. When multiple sessions share the same display name but have different `project_key` values or different `cwd` roots, the UI disambiguates them clearly (using a monospace repository slug badge or tooltip).
3. Sessions and metrics are correctly partitioned by `project_key` in dashboard filters rather than colliding under a single basename.

**Blocked by:** 02 — Client Hooks and Monorepo Subpackage Tagging

**Status:** resolved

- [x] Dashboard displays `project_display_name` prominently while maintaining `project_key` for unique grouping.
- [x] Multiple workspaces with the same folder name (`Monolith`) render as separate, disambiguated workspace streams.
- [x] Project filter dropdown in the dashboard correctly filters by canonical `project_key` without namespace collision.
- [x] End-to-end viewer host test verifies that sessions from distinct paths with identical folder names are partitioned correctly.
