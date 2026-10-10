#!/usr/bin/env bash
printf '%s\n' 'The evaluation runner now creates and cleans up its own disposable sandbox.' \
  'Run: npm run build && npm run eval:coding-life -- --adapters agentmemory' >&2
return 1 2>/dev/null || exit 1
