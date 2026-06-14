# Deploy Secret Log Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent deploy entrypoints and deploy docs from exposing generated bearer secrets through platform logs.

**Architecture:** Keep the existing first-boot model: generated secret -> `/data/.hmac` with `chmod 600` -> runtime `AGENTMEMORY_SECRET` export. Move the operator handoff from low-trust logs to explicit authenticated retrieval paths documented per platform. Add static regression coverage because the vulnerable behavior is shell/docs text, not TypeScript runtime logic.

**Tech Stack:** POSIX shell entrypoints, Markdown deploy docs, TypeScript/Vitest static tests.

---

## Plan Context

Spec path: none. Source of truth is the user delegation plus read-only subagent consensus recorded in `docs/todos/2026-06-13-deploy-secret-log/todo.md`.

Task-owned files:
- `test/deploy-entrypoint-secret.test.ts`
- `deploy/fly/entrypoint.sh`
- `deploy/render/entrypoint.sh`
- `deploy/railway/entrypoint.sh`
- `deploy/coolify/entrypoint.sh`
- `deploy/README.md`
- `deploy/fly/README.md`
- `deploy/railway/README.md`
- `deploy/render/README.md`
- `deploy/coolify/README.md`
- `deploy/fly/fly.toml`
- `README.md`
- `src/viewer/server.ts`
- `docs/todos/2026-06-13-deploy-secret-log/todo.md`
- `docs/todos/2026-06-13-deploy-secret-log/plan.md`

## Task 1: Add Failing Static Regression Test

**Files:**
- Create: `test/deploy-entrypoint-secret.test.ts`

- [x] **Step 1: Write the failing test**

Create a Vitest file that:
- Lists the four deploy entrypoints.
- Reads each entrypoint as text.
- Extracts `echo`/`printf` lines and asserts none contain `$SECRET`, `${SECRET}`, or `AGENTMEMORY_SECRET=$SECRET`.
- Asserts the secure storage/export behavior still exists.
- Reads `deploy/README.md`, provider READMEs, `deploy/fly/fly.toml`, `README.md`, and `src/viewer/server.ts` and rejects stale log-capture phrases.

- [x] **Step 2: Run red verification**

Run attempted:

```bash
npm test -- test/deploy-entrypoint-secret.test.ts
```

Expected before implementation: fail because current entrypoints contain `echo "AGENTMEMORY_SECRET=$SECRET"` and docs contain log-capture instructions.

Actual: local `npm test` could not start because `vitest` was not installed. Used `npx -y vitest@4.1.6 run --exclude test/integration.test.ts test/deploy-entrypoint-secret.test.ts`; it failed red on the current secret log and stale docs.

## Task 2: Remove Secret Value Logging From Entrypoints

**Files:**
- Modify: `deploy/fly/entrypoint.sh`
- Modify: `deploy/render/entrypoint.sh`
- Modify: `deploy/railway/entrypoint.sh`
- Modify: `deploy/coolify/entrypoint.sh`

- [x] **Step 1: Replace first-boot log block**

For every entrypoint, keep `SECRET="$(openssl rand -hex 32)"`, `printf '%s\n' "$SECRET" > "$HMAC_FILE"`, `chmod 600 "$HMAC_FILE"`, and `chown "$RUN_AS" "$HMAC_FILE"`.

Replace the lines that print the value and "Copy this value now" with non-secret status text:

```sh
  echo "agentmemory: generated HMAC secret on first boot"
  echo "agentmemory: secret value intentionally not logged"
  echo "Stored at: $HMAC_FILE (chmod 600)"
  echo "Retrieve it with the platform shell before configuring clients."
  echo "To rotate: delete $HMAC_FILE on the persistent volume, restart, then retrieve the new value from the same file."
```

- [x] **Step 2: Run the focused test**

Run:

```bash
npm test -- test/deploy-entrypoint-secret.test.ts
```

Expected after entrypoint-only changes: docs-related assertions still fail until Task 3 is complete; entrypoint assertions should pass.

Actual: `npx -y vitest@4.1.6 run --exclude test/integration.test.ts test/deploy-entrypoint-secret.test.ts` showed entrypoint assertions passing and docs assertions still failing.

## Task 3: Update Deployment Docs And Runtime Help Text

**Files:**
- Modify: `deploy/README.md`
- Modify: `deploy/fly/README.md`
- Modify: `deploy/railway/README.md`
- Modify: `deploy/render/README.md`
- Modify: `deploy/coolify/README.md`
- Modify: `deploy/fly/fly.toml`
- Modify: `README.md`
- Modify: `src/viewer/server.ts`

- [x] **Step 1: Update shared docs**

Change the shared deploy guarantee to say the generated secret is written to `/data/.hmac`, not printed. Mention operators can preseed `/data/.hmac` when they want to manage the value themselves, or retrieve generated values through authenticated shell/volume access.

- [x] **Step 2: Update provider retrieval sections**

For each provider README:
- Rename "Capture the HMAC secret" to "Retrieve the HMAC secret".
- Remove `logs | grep AGENTMEMORY_SECRET=` instructions.
- Add provider-specific shell/volume commands that read `/data/.hmac`.
- Add a short note that existing deployments which may have exposed old first-boot logs should rotate.
- Update rotation sections so the rotated value is retrieved through the same shell/volume path, not logs.

- [x] **Step 3: Update stale supporting text**

Update:
- `deploy/fly/fly.toml` header comment.
- `README.md` deployment summary wording from "HMAC capture" to retrieval wording.
- `src/viewer/server.ts` message that tells users where to find the deploy secret.

- [x] **Step 4: Run green verification**

Run:

```bash
npm test -- test/deploy-entrypoint-secret.test.ts
npm test -- test/viewer-host.test.ts
```

Expected: both pass.

Actual: `npx -y vitest@4.1.6 run --exclude test/integration.test.ts test/deploy-entrypoint-secret.test.ts test/viewer-host.test.ts` passed 34 tests across 2 files. During prep-merge review, the test was hardened to catch alternate leak forms such as `echo "$AGENTMEMORY_SECRET"`, `printf "$SECRET" >&2`, and direct `cat "$HMAC_FILE"` output; the same focused Vitest command then passed 35 tests across 2 files.

## Task 4: Search And Security Gates

**Files:**
- No planned source edits unless verification finds a task-owned miss.

- [x] **Step 1: Search for stale patterns**

Run targeted searches for:

```bash
rg -n 'AGENTMEMORY_SECRET=\$SECRET|grep.*AGENTMEMORY_SECRET=|AGENTMEMORY_SECRET=<64 hex chars>|printed to stdout\s+exactly once|capture it from the deploy logs|first-boot logs|fresh secret to the logs|printed on first boot|copies it from the deploy logs|copies it once from the deploy logs|Copy this value now' deploy README.md src
```

Expected: no vulnerable deploy-log instructions outside the regression test's banned-pattern list.

Actual: no matches.

- [x] **Step 2: Run Semgrep**

Run:

```bash
semgrep scan --config p/default --error --metrics=off .
```

Expected: pass, or record exact tool/network/finding failure.

Actual: `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings for tracked files. A second explicit changed-file Semgrep scan over all touched paths, including new files, also passed with 0 findings. Both Semgrep commands were rerun after the test hardening and still passed with 0 findings.

- [x] **Step 3: Stage only if committing**

No commit is required by the delegation. If committing, stage only task-owned changes and run:

```bash
gitleaks protect --staged --redact
```

Expected: pass before any commit.

Actual before prep-merge: no commit/staging requested, so this was not run. During prep-merge, a commit was requested; `gitleaks protect --staged --redact` must pass after staging and before commit.

## Task 5: Close Task State

**Files:**
- Modify: `docs/todos/2026-06-13-deploy-secret-log/todo.md`

- [x] **Step 1: Update matrix and notes**

Record verification commands, pass/fail status, evidence, residual risks, subagent review outcomes, and any skipped gates.

- [x] **Step 2: Final handoff**

Report:
- Subagent consensus.
- Fix/kein Fix.
- Files changed.
- Verification commands and results.
- Remaining risks, especially existing leaked logs and scanner availability.
