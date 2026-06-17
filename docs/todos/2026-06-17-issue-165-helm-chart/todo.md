# Issue 165 Helm Chart Task State

Scope: repository deploy packaging, specifically `deploy/helm/agentmemory/`, `deploy/README.md`, a targeted Helm chart contract test, and this task record.

Source of truth:
- User delegation for GitHub issue #165, "Feature request: Kubernetes Helm chart."
- Public read-only issue body from `https://api.github.com/repos/wbugitlab1/agentmemory/issues/165`, inspected on 2026-06-17.
- Existing deploy model in `deploy/README.md`, `deploy/fly/Dockerfile`, `deploy/fly/entrypoint.sh`, and `iii-config.docker.yaml`.

Preflight:
- Worktree: `/Users/A1538552/.codex/worktrees/d709/agentmemory`.
- Initial state: detached `HEAD` at `ce60bba`, clean working tree.
- Local branch created for task: `github-pr/issue-165-helm-chart-ce60bba`.
- Local `issue-165*` branches inspected read-only:
  - `issue-165-helm-chart`
  - `issue-165-helm-chart-pr`
- Read-only branch review result: both local issue branches contain useful Helm chart material but also unrelated issue-216 deletions/code changes. Do not merge or cherry-pick those branches wholesale.
- Existing `origin/main` ref points at `ce60bba`; no fetch approval granted or used.

Sprint Contract:
- Goal: add a Kubernetes Helm chart that deploys agentmemory with the existing single-container `/data` persistence model and documents local install/configuration.
- Scope:
  - Add chart under `deploy/helm/agentmemory/`.
  - Expose only REST service port 3111 by default.
  - Keep viewer/streams/engine/metrics internal unless users port-forward or customize their cluster networking.
  - Use single replica and `Recreate` strategy because state is file-backed SQLite on one PVC.
  - Support existing or Helm-managed Kubernetes Secrets without logging secret values.
  - Add targeted tests and Helm verification where local tooling permits.
  - Update deploy docs to mention Helm.
- Non-goals:
  - No official image publishing pipeline.
  - No CI/CD, GHCR, release, or package publishing change.
  - No HPA or multi-replica support.
  - No external database backend.
  - No changes to agentmemory runtime, auth, API, MCP, or persistence internals.
- Acceptance criteria:
  - `helm lint deploy/helm/agentmemory --set image.repository=example.com/agentmemory` passes.
  - `helm template agentmemory deploy/helm/agentmemory --set image.repository=example.com/agentmemory` renders Deployment, Service, PVC, ServiceAccount, and NetworkPolicy with REST port 3111 and no Service exposure for viewer/engine ports.
  - Chart fails fast for unsupported `replicaCount > 1`.
  - HMAC Secret wiring is file-compatible with existing deploy entrypoints via `AGENTMEMORY_HMAC_FILE`; provider keys use `valueFrom.secretKeyRef`.
  - Ingress docs warn that bearer-authenticated non-loopback clients need HTTPS or an equivalent private tunnel.
  - Targeted Vitest contract test covers key chart files and docs.
  - If a local Kubernetes cluster tool is available, run a Helm install smoke; otherwise record the live-cluster issue criteria as unproven by this environment.
  - README documents install, image requirement, persistence, HMAC handling, provider keys, viewer port-forward, ingress, and upgrade behavior.
- Intended verification:
  - Red/green targeted test: `corepack pnpm exec vitest run test/helm-chart.test.ts`
  - Helm lint: `helm lint deploy/helm/agentmemory --set image.repository=example.com/agentmemory`
  - Helm render: `helm template agentmemory deploy/helm/agentmemory --set image.repository=example.com/agentmemory`
  - Negative render: `helm template agentmemory deploy/helm/agentmemory --set image.repository=example.com/agentmemory --set replicaCount=2`
  - Cluster smoke when available: detect `kind`, `k3d`, or `minikube` plus a current kubectl context before attempting `helm install`; do not create clusters or mutate remote clusters without explicit approval.
  - Security gates before commit: `semgrep scan --config p/default --error --metrics=off .` and, after staging intended files, `gitleaks protect --staged --redact`.
  - Optional broader check if dependencies are usable: `corepack pnpm test`.
- Known boundaries:
  - Public GitHub issue was read unauthenticated; no remote state was changed.
  - No `git fetch`, `git pull`, `git push`, PR creation, merge, publish, deploy, migration, or destructive cleanup is approved.
  - The chart requires `image.repository` because this repo ships Dockerfiles but does not publish an official Kubernetes image in this task.
  - This touches Kubernetes packaging/security defaults, so final prep must report security review and any scanner blockers.
- Stop conditions:
  - Need to publish or select an official image registry.
  - Need to change auth, persistence, runtime ports, API contracts, or package release semantics.
  - Helm tooling missing and no structured local substitute can prove render/lint behavior.
  - Required security gates find unresolved reportable issues.

Feature / Verification Matrix:

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Helm chart skeleton and metadata | Targeted Vitest + `helm lint` | Complete | `corepack pnpm exec vitest run test/helm-chart.test.ts` passed 5/5; `helm lint deploy/helm/agentmemory --set image.repository=example.com/agentmemory` passed with only optional icon info |
| Single-replica Deployment with `/data` PVC and probes | Targeted Vitest + `helm template` inspection | Complete | Default `helm template ... --set image.repository=example.com/agentmemory` rendered `replicas: 1`, `Recreate`, PVC `/data`, and three `/agentmemory/livez` probes |
| Secret handling for HMAC/provider keys | Targeted Vitest + `helm template` with secret values; assert HMAC file mount and provider `secretKeyRef` | Complete | Configured render with managed HMAC plus `secret.existingSecret=agentmemory-secrets` and `secret.existingKeys.openaiApiKey=openai-api-key` mounted HMAC at `/var/run/agentmemory-hmac/hmac` and used `valueFrom.secretKeyRef` for `OPENAI_API_KEY`; literal provider API key values were removed |
| REST-only Service and optional Ingress | Targeted Vitest + `helm template` inspection; docs assert HTTPS/private tunnel warning | Complete | Service rendered exactly one `http` port targeting 3111; Ingress rendered only Service port `http`; README documents HTTPS/private tunnel for bearer-authenticated non-loopback clients |
| Unsupported replica count fails fast | Negative `helm template --set replicaCount=2` | Complete | Negative render exited nonzero with `replicaCount must be 1 because agentmemory stores file-backed SQLite state in a single-writer data directory` |
| Operator docs | Targeted Vitest/read-through | Complete | `deploy/helm/agentmemory/README.md` documents image build, install/upgrade, HMAC, existing provider secrets, viewer port-forward, ingress, NetworkPolicy, persistence, and values; `deploy/README.md` links Helm and distinguishes image ownership |
| Live cluster install/persistence criteria | Local cluster smoke only if safe local cluster tooling/context exists | Unproven locally | `kind`, `k3d`, and `minikube` are absent; `kubectl` exists but `kubectl config current-context` reports no current context, so no safe local `helm install`, pod readiness, curl, or PVC persistence smoke was run |

Subagent Ledger:

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Pre-implementation plan review | `docs/todos/2026-06-17-issue-165-helm-chart/plan.md` and issue scope | No | High/Medium findings only | Complete | Valid findings fixed in plan/task state: HMAC file mount, HTTPS ingress warning, live-cluster caveat, CI-stable Vitest, Semgrep/Gitleaks gate |
| Final implementation review | Task-owned diff | No | Security/test/maintainability findings | Complete after fixes | Security: removed literal provider-key Helm values. Test coverage: strengthened source assertions and zsh-quoted Helm commands. Maintainability: fixed deploy overview wording and matrix staleness. Residual risk is live-cluster behavior unproven locally |

Progress:
- 2026-06-17: loaded repo instructions and required skills.
- 2026-06-17: inspected git status, worktrees, remotes, README, deploy docs/templates, package scripts, local `issue-165*` branches, and issue #165 body.
- 2026-06-17: created local branch `github-pr/issue-165-helm-chart-ce60bba` from clean detached `ce60bba`.
- 2026-06-17: initial `corepack pnpm exec vitest --help` attempted dependency setup and failed on pnpm ignored-build hardening after adding a temporary `allowBuilds` block; the block was removed. This is recorded as a verification setup caveat.
- 2026-06-17: ran two read-only pre-implementation reviewer subagents under `review-and-implement`; valid findings added to the Sprint Contract and plan.
- 2026-06-17: wrote failing Helm contract test and observed RED: 5 failed tests because chart files were absent.
- 2026-06-17: implemented Helm chart, deploy docs, and task docs.
- 2026-06-17: targeted GREEN: `corepack pnpm exec vitest run test/helm-chart.test.ts` passed 5/5.
- 2026-06-17: Helm verification passed: lint, default template, configured HMAC/existing-provider-secret/Ingress template; `replicaCount=2` failed with expected validation.
- 2026-06-17: checked local cluster feasibility; no kind/k3d/minikube and no kubectl current context, so live install/readiness/curl/persistence acceptance criteria remain unproven locally.
- 2026-06-17: full `corepack pnpm test` failed independently after 2198/2200 passing: `test/plugin-surface-contract.test.ts` generated skill reference drift for `plugin/skills/agentmemory-config/REFERENCE.md`, and `test/codex-sdk-provider.test.ts` Codex CLI request timed out after 2000ms.
- 2026-06-17: security gates passed: `semgrep scan --config p/default --error --metrics=off .` reported 0 findings; task-scope `semgrep scan --config p/default --error --metrics=off deploy/helm/agentmemory test/helm-chart.test.ts deploy/README.md` reported 0 findings; `gitleaks protect --staged --redact` reported no leaks.

Review notes:
- Existing local issue branches are not safe integration sources because they include unrelated issue-216 changes.
- Helm is installed at `/opt/homebrew/bin/helm`.
- `yq` is not installed; tests should avoid requiring it.
- Valid pre-implementation findings:
  - HMAC must be mounted as a file and referenced by `AGENTMEMORY_HMAC_FILE`; `AGENTMEMORY_SECRET` env wiring would be ineffective with current deploy entrypoints.
  - Ingress docs must warn about HTTPS/private transport for bearer-authenticated non-loopback clients.
  - Live cluster install, pod readiness, curl, and persistence criteria cannot be claimed from lint/template alone; run a local-cluster smoke only when safe tooling/context is present, otherwise record as unproven.
  - The Vitest test must not shell out to Helm because CI does not install Helm.
  - Semgrep and staged Gitleaks are required before commit because the diff changes Kubernetes security/deployment surfaces.
- Valid final-review findings fixed:
  - Provider API keys are no longer accepted as literal Helm-managed values; provider keys must come from `secret.existingSecret` and `secret.existingKeys.*`.
  - `deploy/README.md` now distinguishes Dockerfile templates from the Helm chart and no longer says "All four".
  - Helm commands with indexed zsh keys now quote those `--set` keys.
  - `test/helm-chart.test.ts` now asserts exactly one Service port, no Service exposure for internal ports, and all three health probes.
  - Verification matrix updated with actual evidence and live-cluster caveat.
- Full-test blockers are independent of this Helm chart change: generated skill reference drift and Codex CLI provider timeout were present in unrelated test files.
