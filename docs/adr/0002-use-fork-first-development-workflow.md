# 2. Use fork-first development workflow

Date: 2026-06-14

## Status

Accepted

## Context

This repository has accumulated local changes that are useful for our work but are not guaranteed to be accepted promptly by the original upstream project. The current local `main` is ahead of the original repository and the repository already has two remotes: the original repository at `https://github.com/rohitg00/agentmemory.git` and the user's fork at `https://github.com/wbugitlab1/agentmemory.git`.

We still want to contribute generally useful fixes upstream, but we cannot let our local development cadence depend on upstream maintainers accepting every pull request.

## Decision

We will treat the user's fork as the primary development line for this workspace. Local Git remotes will use the standard convention:

- `origin` points to `https://github.com/wbugitlab1/agentmemory.git`
- `upstream` points to `https://github.com/rohitg00/agentmemory.git`

The fork's `main` branch is the integration branch for our maintained version. Upstream changes are integrated into the fork with normal merge commits from `upstream/main`; published fork history must not be rebased or rewritten.

Pull requests to the original project are prepared on small branches created from `upstream/main`. Those branches should contain the minimal commits needed for the upstream contribution, not the full fork integration history.

Remote writes, including pushes to the fork, require explicit current-turn confirmation before execution.

## Consequences

We can continue developing independently even when upstream pull requests are delayed or rejected.

Routine upstream synchronization becomes an explicit maintenance activity: fetch upstream, merge `upstream/main` into the fork `main`, run verification, and push to the fork only after confirmation.

Merge conflicts may recur because our fork can intentionally diverge from upstream. Enable Git rerere locally where useful, but do not use force-pushes or rebases to hide divergence.

Upstream contribution work needs extra discipline: fixes intended for the original project should be isolated on branches based on `upstream/main`, while fork-only policy, packaging, or operational changes remain on the fork line.
