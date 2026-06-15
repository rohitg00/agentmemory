# 2. Track upstream pull requests as fork issues

Date: 2026-06-15

## Status

Accepted

## Context

The fork can develop independently from `rohitg00/agentmemory`, but upstream pull requests may still contain fixes or features that are relevant to the fork. GitHub pull request metadata cannot be copied losslessly into another repository, and upstream PRs may remain open, close unmerged, or merge upstream before the fork decides what to do.

We need a fork-owned backlog item for each upstream pull request so fork maintainers can triage, import, test, adopt, modify, reject, or mark upstream-merged PRs without depending on upstream maintainers.

## Decision

We will track each upstream pull request from `rohitg00/agentmemory` as a normal issue in `wbugitlab1/agentmemory`.

Each mirror issue will contain a stable marker:

```markdown
<!-- upstream-pr: rohitg00/agentmemory#123 -->
```

The mirror issue body will include upstream PR metadata, source links, head/base commit information, current upstream state, and fork workflow fields. Labels will record upstream state and fork decision state. The tracker will preserve fork-local decision labels and manual notes across syncs.

The tracker will default to dry-run. Creating or updating fork issues and labels requires explicit current-turn confirmation before execution. Sync comments are out of scope for the first implementation.

## Consequences

The fork gains an owned triage queue for upstream PRs and can decide independently which PRs to import or ignore.

The mirror is not a lossless copy of GitHub PR reviews, checks, reactions, projects, assignees, or discussions. Those remain linked to the upstream PR.

The sync tool must be idempotent and marker-based to avoid duplicate issues. It must not auto-close fork tracker issues solely because an upstream PR closed unmerged; fork maintainers make the final decision with fork-local labels.
