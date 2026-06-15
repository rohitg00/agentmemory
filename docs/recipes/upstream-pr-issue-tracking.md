# Upstream PR Issue Tracking

This fork tracks upstream pull requests from `rohitg00/agentmemory` as normal issues in `wbugitlab1/agentmemory`.

## Marker

Every mirror issue must contain exactly one marker:

```markdown
<!-- upstream-pr-neutral: source=rohitg00/agentmemory number=123 -->
```

The marker is the stable sync key. Do not edit it manually.

Do not put naked GitHub source URLs or `owner/repo#number` source references in public mirror issues. Use source repository and source pull request number fields only; this avoids GitHub cross-reference timeline entries in the upstream repository.

## Labels

Managed labels:

- `upstream-pr`
- `upstream-open`
- `upstream-closed`
- `upstream-merged`
- `upstream-draft`
- `decision-candidate`
- `decision-imported`
- `decision-adopted`
- `decision-modified`
- `decision-rejected`
- `decision-upstream-merged`

The tracker may update `upstream-*` labels from source state. It must preserve existing `decision-*` labels unless explicitly run with a future decision-management command.

## Dry Run

```bash
node --import tsx scripts/github/track-upstream-prs-as-issues.ts \
  --source rohitg00/agentmemory \
  --target wbugitlab1/agentmemory \
  --state all \
  --dry-run \
  --report docs/todos/2026-06-14-track-upstream-prs-as-issues/dry-run-report.json
```

Dry-run uses public unauthenticated reads where possible and performs no writes.

## Apply

Ask for explicit current-turn confirmation before any apply run. Apply creates or updates labels and issues in the fork. It does not create comments in the first implementation.

```bash
node --import tsx scripts/github/track-upstream-prs-as-issues.ts \
  --source rohitg00/agentmemory \
  --target wbugitlab1/agentmemory \
  --state all \
  --apply \
  --from-report docs/todos/2026-06-14-track-upstream-prs-as-issues/dry-run-report.json \
  --confirm-credentialed-reads \
  --confirm-remote-writes \
  --write-delay-ms 10000 \
  --report docs/todos/2026-06-14-track-upstream-prs-as-issues/apply-report.json
```

If GitHub returns a secondary content-creation rate limit, stop and wait for a cooldown. Resume from a fresh dry-run report with a slower `--write-delay-ms` value.

To create only missing PR tracker issues during a resume, add `--create-missing-only` to both the reviewed dry-run and the apply command. This filters out refresh updates for existing tracker issues while still allowing missing issue creation:

```bash
node --import tsx scripts/github/track-upstream-prs-as-issues.ts \
  --source rohitg00/agentmemory \
  --target wbugitlab1/agentmemory \
  --state all \
  --dry-run \
  --create-missing-only \
  --read-with-gh \
  --confirm-credentialed-reads \
  --report docs/todos/2026-06-14-track-upstream-prs-as-issues/dry-run-create-missing-neutral-prs.json
```

## Verify

```bash
node --import tsx scripts/github/track-upstream-prs-as-issues.ts \
  --source rohitg00/agentmemory \
  --target wbugitlab1/agentmemory \
  --state all \
  --verify \
  --report docs/todos/2026-06-14-track-upstream-prs-as-issues/verify-report.json
```

Verification must prove that every upstream PR has exactly one fork issue marker.
