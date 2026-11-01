# Reflection evidence

Reflection connects related facts, lessons, and completed work into insights. Each generated insight must cite at least two distinct source records from the supplied cluster. Stored `sourceMemoryIds`, `sourceLessonIds`, and `sourceCrystalIds` contain only the cited records; an uncited cluster member is not evidence for the result.

`sourceMemoryIds` retains its existing field name and contains semantic-fact IDs. Selected records are read again before an insight is stored, and changed or deleted evidence is rejected. Subsequent source changes do not automatically invalidate an already saved insight.

New insights include `evidenceVersion: 1`. Their identity includes the project and evidence version, so identical text in two projects creates separate records. Existing insights remain readable and are not silently upgraded to validated evidence.

Evidence validation checks that citations identify supplied records. It does not prove that the cited text supports the generated claim, and it does not establish complete project isolation for reflection inputs.

The reflection result includes `rejectedInsights` for invalid or repeated candidate insights and `failedClusters` for unparseable or unterminated responses, provider failures, or persistence failures. An empty `<insights></insights>` response is an abstention. A failed cluster sets `success: false`; results from successfully processed clusters remain available.

## Test the packaged runtime

```sh
node scripts/release-gate/reflection.mjs
```

The gate builds and packs the project, installs the tarball into a clean prefix, and starts the installed CLI with an isolated home, generated local secret, and pinned iii engine. Run the standard release gate first to cache the engine, or set `AGENTMEMORY_GATE_ENGINE` to the matching binary.

To validate an existing artifact:

```sh
node scripts/release-gate/reflection.mjs --tarball /path/to/package.tgz --out /path/to/receipts
```

The deterministic local model supplies accepted, forged, repeated, missing, and malformed citations. The gate also updates a cited fact through the import API while generation is in progress and verifies that the stale result is rejected. It exercises REST, daemon MCP, and the packed standalone MCP bridge; verifies project-specific storage identities and reinforcement; and confirms citations survive daemon restart. It also verifies provider failure reporting and checks that installed package files remain unchanged.

`summary.json`, `wire.json`, and `model-requests.json` record the results and synthetic traffic. Temporary runtime state is removed unless `--keep` is specified. The gate stops only the processes it started. It uses no external model credentials and evaluates the runtime contract rather than model reasoning quality.
