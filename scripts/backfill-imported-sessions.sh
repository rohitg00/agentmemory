#!/usr/bin/env bash
# Backfill memory artifacts for sessions imported via `agentmemory import-jsonl`.
#
# The import path only persists Session + Observation rows (via synthetic,
# zero-LLM compression) and the deterministic crystal/lesson derivation.
# It does NOT call mem::summarize, so the semantic/procedural/reflect tiers
# of the consolidation pipeline have nothing to roll up.
#
# This script walks every session tagged `jsonl-import` and:
#   1. POSTs /agentmemory/summarize per session  (LLM call)
#   2. POSTs /agentmemory/consolidate-pipeline once at the end
#
# Graph extraction (/agentmemory/graph/extract) is intentionally skipped —
# its API takes a per-observation payload, which is cost-prohibitive for
# bulk imports. `reflect` falls back to a no-graph clustering mode.
#
# Usage:
#   scripts/backfill-imported-sessions.sh --dry-run
#   scripts/backfill-imported-sessions.sh --limit 5
#   scripts/backfill-imported-sessions.sh                 # process all

set -euo pipefail

URL="${AGENTMEMORY_URL:-http://localhost:3111}"
DRY_RUN=0
LIMIT=0           # 0 = no limit
ONLY_TAG="jsonl-import"
SKIP_CONSOLIDATE=0
SKIP_AGENTS=0     # drop sessions whose project starts with "agent-"
MAX_OBS=0         # 0 = no cap; skip sessions with more observations than this
DEBUG_ON_ERROR=0  # on failure, dump session metadata + obs to DEBUG_DIR
DEBUG_DIR="${AGENTMEMORY_DEBUG_DIR:-./agentmemory-debug}"
PROJECT_PATTERN=""  # jq test() regex against .project; "" means no filter

# Cost-estimate knobs (defaults tuned for DeepSeek V4 Flash on DeepInfra:
# $0.14 / 1M input, $0.28 / 1M output). Override via env if needed.
COST_IN_PER_1M="${AGENTMEMORY_COST_IN_PER_1M:-0.14}"
COST_OUT_PER_1M="${AGENTMEMORY_COST_OUT_PER_1M:-0.28}"
# Rough token weight per compressed observation, derived from inspecting
# real synthetic-compression payloads in the kv store (mostly 100-300 tok,
# heavy-tailed). Override if your sessions are unusually verbose.
TOKENS_PER_OBS="${AGENTMEMORY_TOKENS_PER_OBS:-200}"
# Reserved per-call output budget (XML summary is small).
TOKENS_OUT_PER_SESSION="${AGENTMEMORY_TOKENS_OUT_PER_SESSION:-500}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)         DRY_RUN=1; shift ;;
    --limit)           LIMIT="${2:?--limit needs a number}"; shift 2 ;;
    --tag)             ONLY_TAG="${2:?--tag needs a value (use empty string for all)}"; shift 2 ;;
    --skip-consolidate) SKIP_CONSOLIDATE=1; shift ;;
    --skip-agents)     SKIP_AGENTS=1; shift ;;
    --max-obs)         MAX_OBS="${2:?--max-obs needs a number}"; shift 2 ;;
    --debug-on-error)  DEBUG_ON_ERROR=1; shift ;;
    --project-pattern) PROJECT_PATTERN="${2:?--project-pattern needs a regex}"; shift 2 ;;
    -h|--help)
      sed -n '2,28p' "$0"
      exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

for bin in curl jq; do
  command -v "$bin" >/dev/null || { echo "missing dependency: $bin" >&2; exit 1; }
done

# Curl timeout profiles. Metadata reads (livez, sessions list, observations
# pull for debug dumps) should fail fast and retry transient blips. The LLM
# work calls (summarize, consolidate) intentionally have no --retry and a
# wide --max-time: each call can legitimately take minutes for chunked
# summarize on large sessions, and retrying a half-finished LLM job is
# expensive both in dollars and in duplicated server-side work.
META_CURL_OPTS=(--connect-timeout 10 --max-time 30 --retry 2 --retry-delay 1)
WORK_CURL_OPTS=(--connect-timeout 10 --max-time 1800)

echo "agentmemory backfill — server: $URL"
[[ "$DRY_RUN" == 1 ]] && echo "DRY RUN: no POSTs will be made."

# --- liveness ---
if ! curl -fsS "${META_CURL_OPTS[@]}" "$URL/agentmemory/livez" >/dev/null; then
  echo "server not reachable at $URL (try: npx @agentmemory/agentmemory)" >&2
  exit 1
fi

# --- collect session ids ---
sessions_json="$(curl -fsS "${META_CURL_OPTS[@]}" "$URL/agentmemory/sessions")"
filter='.sessions[] | select(.status=="completed")'
if [[ -n "$ONLY_TAG" ]]; then
  filter+=" | select((.tags // []) | index(\"$ONLY_TAG\"))"
fi
if [[ "$SKIP_AGENTS" == 1 ]]; then
  filter+=' | select((.project // "") | startswith("agent-") | not)'
fi
if [[ -n "$PROJECT_PATTERN" ]]; then
  # jq's test() applies a regex against the project string.
  filter+=" | select((.project // \"\") | test(\"$PROJECT_PATTERN\"))"
fi
if [[ "$MAX_OBS" -gt 0 ]]; then
  filter+=" | select((.observationCount // 0) <= $MAX_OBS)"
fi
filter+=' | "\(.id)\t\(.observationCount // 0)\t\(.project // "")"'

rows=()
while IFS= read -r line; do
  rows+=("$line")
done < <(echo "$sessions_json" | jq -r "$filter")
total="${#rows[@]}"

if [[ "$total" -eq 0 ]]; then
  echo "no sessions matched (tag='$ONLY_TAG'); nothing to do."
  exit 0
fi

if [[ "$LIMIT" -gt 0 && "$LIMIT" -lt "$total" ]]; then
  rows=("${rows[@]:0:$LIMIT}")
fi

echo "matched $total session(s); will process ${#rows[@]}."
total_obs=0
for row in "${rows[@]}"; do
  obs="$(cut -f2 <<<"$row")"
  total_obs=$(( total_obs + obs ))
done
est_in=$(( total_obs * TOKENS_PER_OBS + ${#rows[@]} * 500 ))
est_out=$(( ${#rows[@]} * TOKENS_OUT_PER_SESSION ))
est_cost="$(awk -v i="$est_in" -v o="$est_out" -v ci="$COST_IN_PER_1M" -v co="$COST_OUT_PER_1M" \
  'BEGIN { printf "%.2f", (i*ci + o*co) / 1000000 }')"

echo "≈ ${#rows[@]} summarize LLM calls (one per session, covering $total_obs observations)"
printf '≈ %d input tok + %d output tok → $%s  (rates: in=$%s/1M out=$%s/1M, %s tok/obs)\n' \
  "$est_in" "$est_out" "$est_cost" "$COST_IN_PER_1M" "$COST_OUT_PER_1M" "$TOKENS_PER_OBS"
echo

if [[ "$DRY_RUN" == 1 ]]; then
  printf '%-40s %10s  %s\n' "session" "obs" "project"
  for row in "${rows[@]}"; do
    id="$(cut -f1 <<<"$row")"
    obs="$(cut -f2 <<<"$row")"
    proj="$(cut -f3 <<<"$row")"
    printf '%-40s %10s  %s\n' "$id" "$obs" "$proj"
  done
  echo
  echo "(dry run) next steps if you re-run without --dry-run:"
  echo "  for each session above: POST $URL/agentmemory/summarize {sessionId}"
  if [[ "$SKIP_CONSOLIDATE" == 0 ]]; then
    echo "  then: POST $URL/agentmemory/consolidate-pipeline {}"
  fi
  exit 0
fi

# --- summarize loop ---
if [[ "$DEBUG_ON_ERROR" == 1 ]]; then
  mkdir -p "$DEBUG_DIR"
  echo "debug mode: failed calls will dump to $DEBUG_DIR/"
  echo
fi

dump_failure() {
  local id="$1" obs="$2" resp="$3"
  # Replace anything outside [A-Za-z0-9._-] with `_` before joining with
  # DEBUG_DIR. Session IDs from the API are UUIDs in practice, but the
  # server doesn't enforce that — a hostile or buggy id containing `/` or
  # `..` would otherwise escape the debug directory.
  local safe_id
  safe_id="$(printf '%s' "$id" | tr -c 'A-Za-z0-9._-' '_')"
  local file="$DEBUG_DIR/${safe_id}.json"
  # Pull the raw observations (what would have gone into the prompt) so the
  # operator can reconstruct the upstream payload locally. We also compute
  # narrative size stats so size-related rejections are immediately visible.
  # Stream observations through stdin (avoids exec-arg overflow on
  # multi-thousand-obs sessions — macOS argv ceiling is ~256k).
  # `--get --data-urlencode` percent-encodes the session id so special
  # characters can't corrupt the query string.
  curl -fsS "${META_CURL_OPTS[@]}" --get \
       --data-urlencode "sessionId=$id" \
       "$URL/agentmemory/observations" \
    | jq \
        --arg id "$id" \
        --argjson obsCount "$obs" \
        --arg url "$URL/agentmemory/summarize" \
        --argjson response "$resp" \
        '. as $root
         | .observations as $obs
         | {
             sessionId: $id,
             observationCount: $obsCount,
             request: { url: $url, method: "POST", body: { sessionId: $id } },
             response: $response,
             observations: $obs,
             stats: {
               totalNarrativeBytes: ($obs | map(.narrative // "" | length) | add // 0),
               maxNarrativeBytes:   ($obs | map(.narrative // "" | length) | max // 0),
               titleHistogram:      ($obs | group_by(.title) | map({title: .[0].title, count: length}) | sort_by(-.count))
             }
           }' >"$file"
  echo "      → $file"
}

ok=0; skipped=0; failed=0
i=0
for row in "${rows[@]}"; do
  i=$(( i + 1 ))
  id="$(cut -f1 <<<"$row")"
  obs="$(cut -f2 <<<"$row")"

  body="$(jq -nc --arg id "$id" '{sessionId:$id}')"
  resp="$(curl -sS "${WORK_CURL_OPTS[@]}" -X POST "$URL/agentmemory/summarize" \
    -H 'content-type: application/json' --data "$body" || echo '{"success":false,"error":"curl_failed"}')"
  # iii's HTTP layer occasionally returns non-JSON (HTML 5xx, empty body
  # on timeout, etc.). Validate before parsing so `set -e` doesn't abort
  # the whole backfill loop on a single bad response.
  if jq -e . >/dev/null 2>&1 <<<"$resp"; then
    status="$(jq -r '.success // false' <<<"$resp")"
    err="$(jq -r '.error // ""' <<<"$resp")"
    title="$(jq -r '.summary.title // ""' <<<"$resp")"
  else
    status="false"
    err="invalid_json_response"
    title=""
  fi

  if [[ "$status" == "true" ]]; then
    ok=$(( ok + 1 ))
    printf '[%3d/%3d] OK    %s  obs=%-5s  %s\n' "$i" "${#rows[@]}" "$id" "$obs" "$title"
  elif [[ "$err" == "no_observations" || "$err" == "no_provider" ]]; then
    skipped=$(( skipped + 1 ))
    printf '[%3d/%3d] SKIP  %s  obs=%-5s  %s\n' "$i" "${#rows[@]}" "$id" "$obs" "$err"
  else
    failed=$(( failed + 1 ))
    printf '[%3d/%3d] FAIL  %s  obs=%-5s  %s\n' "$i" "${#rows[@]}" "$id" "$obs" "$err"
    [[ "$DEBUG_ON_ERROR" == 1 ]] && dump_failure "$id" "$obs" "$resp"
  fi
done

echo
echo "summarize: ok=$ok skipped=$skipped failed=$failed"

# --- consolidate ---
if [[ "$SKIP_CONSOLIDATE" == 1 ]]; then
  echo "skipping consolidate-pipeline (--skip-consolidate)"
  exit 0
fi

if [[ "$ok" -eq 0 ]]; then
  echo "no summaries produced; skipping consolidate-pipeline."
  exit 0
fi

echo
echo "running consolidate-pipeline …"
resp="$(curl -sS "${WORK_CURL_OPTS[@]}" -X POST "$URL/agentmemory/consolidate-pipeline" \
  -H 'content-type: application/json' --data '{}' || echo '{"success":false,"error":"curl_failed"}')"
if jq -e . >/dev/null 2>&1 <<<"$resp"; then
  echo "$resp" | jq .
else
  echo "consolidate-pipeline returned non-JSON (likely a timeout or upstream error):"
  printf '%s\n' "$resp" | head -c 500
  echo
fi
