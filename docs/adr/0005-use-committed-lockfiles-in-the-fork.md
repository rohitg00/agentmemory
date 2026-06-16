# 5. Use committed lockfiles in the fork

Date: 2026-06-16

## Status

Accepted

## Context

This fork is maintained independently from the original upstream repository, as recorded in ADR 3. The upstream repository historically used a no-lockfile policy: root `.gitignore` and `website/.gitignore` ignore `package-lock.json`, `pnpm-lock.yaml`, and `yarn.lock`; CI and publish workflows generate a temporary npm lockfile in the runner with `npm install --package-lock-only` and then run `npm ci`.

That approach reduces lockfile churn in pull requests, but it leaves the repository without a committed dependency graph. Fresh installs can resolve different transitive versions over time, CI jobs are only deterministic within a single run, and dependency scanners have no durable lockfile input in the source tree. Several task records already note that missing lockfiles blocked or weakened verification in isolated worktrees.

Our workspace security policy treats missing lockfiles as a supply-chain risk. It also prefers `pnpm` for JavaScript and TypeScript projects unless project-local instructions or a current task explicitly require a different package manager.

## Decision

This fork will use committed lockfiles for JavaScript and TypeScript package surfaces.

The target package manager is `pnpm`. The fork will introduce `pnpm-lock.yaml` for the root project and for any workspace/package layout that is included in the chosen pnpm configuration. `package.json` files that participate in pnpm installs will pin the package manager with a `packageManager` field. CI and publish workflows will install from the committed lockfile with `pnpm install --frozen-lockfile --ignore-scripts` instead of generating temporary npm lockfiles.

Internal package relationships that should resolve from the local workspace during source builds will use pnpm workspace dependencies. Packages that use `workspace:` dependencies must be packed or published through pnpm so the published npm artifact receives the normal semver dependency range that npm consumers expect.

The package-manager migration and lockfile introduction will be done as one verified migration. The fork will not first introduce a committed `package-lock.json` only to replace it with `pnpm-lock.yaml` later.

The fork will remove no-lockfile ignore rules and update documentation that tells agents or contributors not to commit generated lockfiles. Future dependency updates must include the relevant lockfile changes in the same change set.

This is a fork-only packaging and supply-chain policy decision. It does not require the original upstream project to adopt the same policy.

## Consequences

Builds, tests, security scans, and release provenance become more reproducible because the resolved dependency graph is versioned with the source. Worktrees can bootstrap dependencies with a deterministic command instead of first generating an ignored lockfile. OSV and other dependency scanners get a stable source artifact to inspect.

Dependency update pull requests will include lockfile diffs. Those diffs can be noisy, especially when transitive dependencies, peer resolution, optional platform packages, or package-manager versions change. Reviews must treat lockfile churn as dependency-surface evidence rather than unrelated noise.

The migration will touch package-manager metadata, CI, publish workflows, contributor documentation, and existing task/agent guidance. It must be implemented as a single verified migration task with dependency intake, lockfile review, npm package-content dry-runs, OSV scanning, Semgrep where required, and the standard staged secret scan before any commit.
