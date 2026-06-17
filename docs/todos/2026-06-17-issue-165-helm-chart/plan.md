# Issue 165 Helm Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Kubernetes Helm chart for agentmemory that mirrors the existing single-container deploy model and is locally verifiable.

**Architecture:** The chart lives under `deploy/helm/agentmemory/` and renders one Deployment, one Service, optional PVC/Ingress/Secret/NetworkPolicy resources, and operator notes. Runtime behavior remains in the existing deploy image/entrypoint; the chart only wires Kubernetes resources and values around the current `/data` state directory and REST health endpoint.

**Tech Stack:** Helm v3 chart templates, Kubernetes YAML, TypeScript/Vitest contract test, existing pnpm workspace.

---

## File Structure

- Create `test/helm-chart.test.ts`: targeted contract test that fails before the chart exists and checks the chart surface without requiring a live cluster.
- Create `deploy/helm/agentmemory/Chart.yaml`: Helm metadata and app version.
- Create `deploy/helm/agentmemory/values.yaml`: safe defaults and configurable image, persistence, secrets, ingress, network policy, probes, resources, scheduling.
- Create `deploy/helm/agentmemory/templates/_helpers.tpl`: names, labels, validation, image requirement, secret/PVC helpers.
- Create `deploy/helm/agentmemory/templates/deployment.yaml`: single-container pod, PVC mount, probes, internal ports, env/secret wiring.
- Create `deploy/helm/agentmemory/templates/service.yaml`: REST-only ClusterIP Service.
- Create `deploy/helm/agentmemory/templates/pvc.yaml`: optional `ReadWriteOnce` data PVC.
- Create `deploy/helm/agentmemory/templates/secret.yaml`: optional Helm-managed Secret for quick tests only.
- Create `deploy/helm/agentmemory/templates/ingress.yaml`: optional REST API ingress.
- Create `deploy/helm/agentmemory/templates/networkpolicy.yaml`: default ingress policy for REST port only.
- Create `deploy/helm/agentmemory/templates/serviceaccount.yaml`: optional ServiceAccount with token automount disabled by default.
- Create `deploy/helm/agentmemory/templates/NOTES.txt`: post-install port-forward and HMAC retrieval notes.
- Create `deploy/helm/agentmemory/README.md`: operator docs.
- Modify `deploy/README.md`: add Helm to platform list and mention image build requirement.
- Update `docs/todos/2026-06-17-issue-165-helm-chart/todo.md`: progress, verification evidence, review notes.

Spec path: none. Source of truth is issue #165 plus this task record.

GitHub PR prep: mandatory after implementation. Fetch/push/PR creation are not approved. Use existing local `origin/main` only unless the user explicitly approves fetch.

Security-sensitive surfaces for push prep: Kubernetes deployment manifests, Secret handling, NetworkPolicy/Ingress exposure, container security contexts, and deployment documentation.

Pre-implementation review corrections: HMAC must be file-mounted through `AGENTMEMORY_HMAC_FILE`, Ingress docs must require HTTPS/private transport for bearer-authenticated non-loopback access, live-cluster acceptance criteria must be verified only when a safe local cluster is available or recorded as unproven, Vitest must not shell out to Helm, and Semgrep plus staged Gitleaks are required before commit.

## Task 1: Red Test For Helm Chart Contract

**Files:**
- Create: `test/helm-chart.test.ts`

- [ ] **Step 1: Write the failing test**

Create a Vitest file that asserts the chart exists, values document the required single-writer defaults, service exposes only REST, HMAC wiring uses an `AGENTMEMORY_HMAC_FILE` secret mount instead of literal `AGENTMEMORY_SECRET`, provider keys use `valueFrom.secretKeyRef`, and docs mention image build, viewer port-forwarding, and HTTPS/private transport for ingress.

- [ ] **Step 2: Run red test**

Run: `corepack pnpm exec vitest run test/helm-chart.test.ts`

Expected before implementation: fail because `deploy/helm/agentmemory/Chart.yaml` and related files do not exist. This test must use file reads and text assertions only; it must not shell out to `helm` because repo CI does not install Helm.

## Task 2: Add Helm Chart Core

**Files:**
- Create: `deploy/helm/agentmemory/Chart.yaml`
- Create: `deploy/helm/agentmemory/values.yaml`
- Create: `deploy/helm/agentmemory/templates/_helpers.tpl`
- Create: `deploy/helm/agentmemory/templates/deployment.yaml`
- Create: `deploy/helm/agentmemory/templates/service.yaml`
- Create: `deploy/helm/agentmemory/templates/pvc.yaml`
- Create: `deploy/helm/agentmemory/templates/secret.yaml`
- Create: `deploy/helm/agentmemory/templates/ingress.yaml`
- Create: `deploy/helm/agentmemory/templates/networkpolicy.yaml`
- Create: `deploy/helm/agentmemory/templates/serviceaccount.yaml`
- Create: `deploy/helm/agentmemory/templates/NOTES.txt`

- [ ] **Step 1: Implement minimal chart**

Add the chart with:
- `apiVersion: v2`, `type: application`, app version `0.9.27`.
- Required `image.repository` validation because no official chart image is published by this task.
- `replicaCount: 1` validation and Deployment `replicas: 1`.
- `strategy.type: Recreate`.
- `/data` PVC defaults with `ReadWriteOnce`.
- REST Service on named port `http` only.
- Deployment container ports for internal runtime ports, but no Service exposure for viewer/streams/engine/metrics.
- `startupProbe`, `livenessProbe`, and `readinessProbe` against `/agentmemory/livez`.
- Optional existing or managed Secret support for HMAC and provider keys. HMAC must be mounted as a file and exposed through `AGENTMEMORY_HMAC_FILE`; provider keys must use `valueFrom.secretKeyRef` env vars.
- Optional Ingress targeting only the REST Service.
- Default NetworkPolicy allowing inbound REST only in enforcing clusters.

- [ ] **Step 2: Run green test**

Run: `corepack pnpm exec vitest run test/helm-chart.test.ts`

Expected after implementation: pass.

## Task 3: Helm Render And Negative Checks

**Files:**
- Modify if needed: `deploy/helm/agentmemory/templates/*.yaml`
- Modify if needed: `deploy/helm/agentmemory/values.yaml`
- Modify if needed: `test/helm-chart.test.ts`

- [ ] **Step 1: Lint chart**

Run: `helm lint deploy/helm/agentmemory --set image.repository=example.com/agentmemory`

Expected: pass without lint errors.

- [ ] **Step 2: Render default chart**

Run: `helm template agentmemory deploy/helm/agentmemory --set image.repository=example.com/agentmemory`

Expected: render Deployment, Service, PVC, ServiceAccount, and NetworkPolicy; not render Ingress or managed Secret by default.

- [ ] **Step 3: Render configured secrets and ingress**

Run: `helm template agentmemory deploy/helm/agentmemory --set image.repository=example.com/agentmemory --set secret.agentmemorySecret=example-secret --set secret.existingSecret=agentmemory-secrets --set secret.existingKeys.openaiApiKey=openai-api-key --set ingress.enabled=true --set 'ingress.hosts[0].host=agentmemory.example.com' --set 'ingress.hosts[0].paths[0].path=/' --set 'ingress.hosts[0].paths[0].pathType=Prefix'`

Expected: render Secret and Ingress. Deployment must mount HMAC at `/var/run/agentmemory-hmac/hmac` with `AGENTMEMORY_HMAC_FILE`; provider keys must be `valueFrom.secretKeyRef`; Service and Ingress must target REST only.

- [ ] **Step 4: Verify unsupported scale fails**

Run: `helm template agentmemory deploy/helm/agentmemory --set image.repository=example.com/agentmemory --set replicaCount=2`

Expected: nonzero exit with message that `replicaCount` must be `1`.

## Task 4: Documentation

**Files:**
- Create: `deploy/helm/agentmemory/README.md`
- Modify: `deploy/README.md`

- [ ] **Step 1: Document chart usage**

Document prerequisites, image build/push, install/upgrade, HMAC lifecycle, provider keys, viewer port-forward, ingress with HTTPS/private transport warning, network policy, persistence, and key values.

- [ ] **Step 2: Link chart from deploy overview**

Add Kubernetes/Helm to the deploy matrix and mention that Helm needs a user-supplied image built from existing deploy Dockerfiles.

- [ ] **Step 3: Re-run docs-related test**

Run: `corepack pnpm exec vitest run test/helm-chart.test.ts`

Expected: pass.

## Task 5: Review, Simplify, And Verify

**Files:**
- Modify only task-owned files if review finds valid issues.
- Update: `docs/todos/2026-06-17-issue-165-helm-chart/todo.md`

- [ ] **Step 1: Run focused simplification pass**

Inspect only the Helm chart, docs, and test. Remove redundant branches/comments, keep validation at Helm boundaries, and preserve the external chart contract.

- [ ] **Step 2: Run final targeted verification**

Run:
- `corepack pnpm exec vitest run test/helm-chart.test.ts`
- `helm lint deploy/helm/agentmemory --set image.repository=example.com/agentmemory`
- `helm template agentmemory deploy/helm/agentmemory --set image.repository=example.com/agentmemory`
- `helm template agentmemory deploy/helm/agentmemory --set image.repository=example.com/agentmemory --set secret.agentmemorySecret=example-secret --set secret.existingSecret=agentmemory-secrets --set secret.existingKeys.openaiApiKey=openai-api-key --set ingress.enabled=true --set 'ingress.hosts[0].host=agentmemory.example.com' --set 'ingress.hosts[0].paths[0].path=/' --set 'ingress.hosts[0].paths[0].pathType=Prefix'`
- `helm template agentmemory deploy/helm/agentmemory --set image.repository=example.com/agentmemory --set replicaCount=2`

Expected:
- Targeted Vitest passes.
- Helm lint passes.
- Default render succeeds.
- Configured secret/ingress render succeeds and keeps Secret values out of Deployment env literals.
- Replica-count negative render fails with expected validation error.

- [ ] **Step 3: Check local cluster smoke feasibility**

Run read-only tool/context checks:
- `command -v kind`
- `command -v k3d`
- `command -v minikube`
- `command -v kubectl`
- `kubectl config current-context`

Expected: if a safe local cluster context is already available and using it would not mutate a remote/shared cluster, run a Helm install smoke in a temporary namespace after explicit approval for cluster mutation. If no safe local cluster exists, record that issue criteria requiring actual pod readiness, curl, upgrade/restart persistence, and `helm install` are not proven locally.

- [ ] **Step 4: Run security gates**

Run:
- `semgrep scan --config p/default --error --metrics=off .`
- After staging intended files, `gitleaks protect --staged --redact`

Expected: both pass, or any blocker is fixed or explicitly accepted before commit.

- [ ] **Step 5: Run broader feasible checks**

Try `corepack pnpm test` only after dependency hardening is handled by the repo-documented `corepack pnpm install --frozen-lockfile --ignore-scripts` path if needed. If full tests remain blocked by independent plugin-surface generated-doc drift or pnpm ignored-build hardening, record exact evidence and closest passing checks.

- [ ] **Step 6: Commit task-owned changes**

After review and verification, stage only task-owned files and commit with:

```bash
git add test/helm-chart.test.ts deploy/helm/agentmemory deploy/README.md docs/todos/2026-06-17-issue-165-helm-chart
git commit -m "feat(deploy): add Kubernetes Helm chart"
```

Expected: one local commit on `github-pr/issue-165-helm-chart-ce60bba`.

## Self-Review

- Spec coverage: issue acceptance criteria map to chart files, Helm lint/template checks, secret handling, persistence docs, and viewer port-forward docs.
- Placeholder scan: no `TBD`, `TODO`, or unresolved implementation placeholders.
- Scope check: official image publishing, HPA, backup jobs, ServiceMonitor, and external state backends are intentionally out of scope.
- Type/API consistency: no TypeScript runtime API changes; Kubernetes values names are stable across templates, docs, and tests.
