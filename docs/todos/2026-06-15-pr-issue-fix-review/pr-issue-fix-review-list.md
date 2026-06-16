# PRs Claiming Fixes For Known Issues

This scoped worklist excerpt exists because the review branch was created from local `main` without the coordinator's untracked full worklist file. It keeps the PR 892 row available for this worker and intentionally uses neutral identifiers only.

## Worklist

| Review status | Fork decision | Upstream PR | Upstream state | Fork tracker | Claimed fixed issues | PR title | Author | Updated | Review notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| reviewed | adapt | PR 892 | open | Fork issue 401 | Issue 700 - engine state store pollutes caller data directory<br>Issue 844 - global npm install uses unresolvable relative worker supervision paths | fix(cli): anchor engine cwd and rewrite bundled config with absolute paths | rohitg00 | 2026-06-10T22:59:45Z | Relevant locally for Issue 700 and Issue 844. Adapted runtime config generation and native engine cwd anchoring; did not import automatic caller-data copy because it can cross project data ownership boundaries. Issue 303 claim remains owned by a separate batch. |
