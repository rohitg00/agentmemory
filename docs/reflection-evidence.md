# Reflection evidence

Reflection connects related facts, lessons, and completed work into insights. Each generated insight must cite between two and twenty distinct source records from the supplied cluster. Stored `sourceMemoryIds`, `sourceLessonIds`, and `sourceCrystalIds` contain only the cited records; an uncited cluster member is not evidence for the result.

`sourceMemoryIds` retains its existing field name and contains semantic-fact IDs. Selected records are read again before an insight is stored, and changed or deleted evidence is rejected. Subsequent source changes do not automatically invalidate an already saved insight.

New insights include `evidenceVersion: 1`. Their identity includes the project and evidence version, so identical text in two projects creates separate records. Existing insights remain readable and are not silently upgraded to validated evidence.

Evidence validation checks that citations identify supplied records. It does not prove that the cited text supports the generated claim, and it does not establish complete project isolation for reflection inputs.

The reflection result includes `rejectedInsights` for invalid or repeated candidate insights and `failedClusters` for unparseable or unterminated responses, provider failures, or persistence failures. An empty `<insights></insights>` response is an abstention. A failed cluster sets `success: false`; results from successfully processed clusters remain available.

## Size and result limits

Reflection selects complete records in store order, with at most 20 facts, 20 lessons and 20 crystals per cluster. Each type has a 16 KiB budget measured as UTF-8 serialized JSON, including source IDs and label overhead. A record exceeding 4 KiB is skipped; later smaller records can still qualify. Records are never truncated, and citation labels are assigned after selection. A cluster must retain at least three records to reach the model.

Each cluster retains at most 32 distinct concept names, each fitting 128 bytes of serialized JSON. The combined system and user prompt is limited to 64 KiB. Model responses exceeding 64 KiB fail the cluster before parsing. Generated titles fit 256 UTF-8 bytes and insight content fits 4 KiB. Oversized candidates and citations outside the supplied evidence are rejected. Reinforcement replaces source references and concept metadata with the newly validated, bounded evidence.

`maxClusters` defaults to 10 and is capped at 20. Insight list and search limits default to 50 and 10 respectively and are capped at 500. Supplied counts must be positive safe integers; `minConfidence` must be finite and between 0 and 1. Invalid options return a small error, with HTTP 400 through REST and daemon MCP.

Insight results and their REST/MCP envelopes are checked against the existing 15 MiB transport safety budget. An oversized response returns a small refusal with HTTP 413, including when escaping JSON inside an MCP text response expands its size. Reduce the limit or narrow the project/search filter. Oversized legacy records are preserved in storage.

These limits bound model input, newly accepted provenance and outgoing insight responses. They do not paginate the engine's initial full-scope state reads or bound reflection's clustering work. A store exceeding the engine-to-worker read limit still requires storage-level pagination; response slicing cannot solve that problem. Other list and export endpoints retain their own contracts.

## Test the packaged runtime

```sh
node scripts/release-gate/reflection.mjs
```

The gate builds and packs the project, installs the tarball into a clean prefix, and starts the installed CLI with an isolated home, generated local secret, and pinned iii engine. Run the standard release gate first to cache the engine, or set `AGENTMEMORY_GATE_ENGINE` to the matching binary.

To validate an existing artifact:

```sh
node scripts/release-gate/reflection.mjs --tarball /path/to/package.tgz --out /path/to/receipts
```

The deterministic local model supplies accepted, forged, repeated, missing, excessive, and malformed citations. It checks bounded evidence selection, oversized model output, count validation, large legacy result refusal and MCP escaping overhead. The gate also updates a cited fact through the import API while generation is in progress and verifies that the stale result is rejected. It exercises REST, daemon MCP, and the packed standalone MCP bridge; verifies project-specific storage identities and reinforcement; and confirms citations survive daemon restart. It also verifies provider failure reporting and checks that installed package files remain unchanged.

`summary.json`, `wire.json`, and `model-requests.json` record the results and synthetic traffic. Temporary runtime state is removed unless `--keep` is specified. The gate stops only the processes it started. It uses no external model credentials and evaluates the runtime contract rather than model reasoning quality.
