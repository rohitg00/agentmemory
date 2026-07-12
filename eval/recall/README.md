# Recall benchmark

`fixtures/sanitized.json` contains committed, sanitized project cases. A local,
gitignored fixture may add real project cases with the same schema. Score each
case from its persisted recall trace with `scoreRecallBenchmark`.

Hard gates are zero scope contamination, zero budget violations, zero duplicate
or stale injection. Precision and hit rate are reported for regression tracking.
