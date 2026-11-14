# Import edited Obsidian memory notes

Export memory notes to a vault, edit their body, H1 title or `type`, and import the
corrections through the running agentmemory daemon. Updates use `mem::evolve`, so
the previous memory remains in history and the current search indexes are updated.
A note without an `id` creates a memory through `mem::remember`.

The vault path is on the **daemon's filesystem**. Both directions stay under
`AGENTMEMORY_EXPORT_ROOT` (default `~/.agentmemory`); `AGENTMEMORY_IMPORT_ROOT`
cannot widen this boundary. Start the daemon with the export root configured.

Export through the existing REST endpoint:

```sh
curl -X POST http://localhost:3111/agentmemory/obsidian/export \
  -H "Authorization: Bearer $AGENTMEMORY_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"vaultDir":"/path/under/export-root/vault","types":"memories"}'
```

Preview and apply edits using the CLI:

```sh
agentmemory obsidian-import --vault-dir /path/under/export-root/vault --dry-run
agentmemory obsidian-import --vault-dir /path/under/export-root/vault
agentmemory obsidian-import --vault-dir /path/under/export-root/vault --prefer store
```

The CLI connects to the configured daemon using the existing URL, port and secret
resolution. It does not start an engine. It prints JSON containing `planned`
(`creates`, `updates`, `unchanged`), `applied` (`created`, `updated`), `conflicts`,
`errors` and per-file planned actions. Argument errors exit 2; HTTP or import
failures exit 1. A successful dry run or import exits 0. Confirmed writes include
their new IDs in `files[].appliedMemoryId`.

The equivalent authenticated endpoint is `POST /agentmemory/obsidian/import`:

```json
{"vaultDir":"/path/under/export-root/vault","dryRun":true,"prefer":"vault"}
```

`vaultDir` is required. `dryRun` defaults to `false`; `prefer` accepts `vault`
(default) or `store`. Dry runs leave memory, indexes, audit, import provenance and
vault files unchanged. No new MCP tool is added.

## Editing and conflicts

- Keep the exported `id` and other frontmatter unchanged, except `type`. Supported
  types are `pattern`, `preference`, `architecture`, `bug`, `workflow` and `fact`.
  Changes to strength, timestamps, version, concepts or files are reported as
  unsupported rather than silently discarded.
- New notes can use an H1 title and optional `type` frontmatter. Without an H1,
  their filename supplies the title. Other frontmatter is rejected. Loaded body
  and title text passes through the same private-block and secret scrubbing as
  ordinary memory writes.
- Keep generated trailing Concepts, Related and Supersedes sections unchanged.
  Import strips only a tail proved by that note's stored export context. A
  user-written section with the same heading remains part of the body. An edited
  generated tail produces an ambiguity error. A legacy multiline title can stay
  intact while its body changes; editing that title is reported as ambiguous.
- If both the vault and store changed since export or the last successful
  import, the report includes a conflict. `vault` evolves the actual latest
  descendant with the vault correction; `store` leaves the store unchanged.
  Store-only corrections survive imports of untouched old notes.
- Repeating an import of the same note does not create another version or write
  another provenance record. Re-export can leave old and new ID-named notes;
  import retains both files and resolves only a unique parent lineage. Unknown
  IDs, duplicate IDs and multiple changed notes targeting one lineage are errors.

The daemon records compact hashes of export context after a successful file
write, and import provenance after a confirmed memory write. These records contain
neither note bodies nor vault paths. For older exports without this context,
identity, creation time, version, concepts, files and the generated tail are
checked against the stored version. A `legacy_export_context` warning reports
that mutable `updated` and `strength` fields cannot be verified historically;
their vault values are never applied. If the remaining facts cannot be proved,
import reports an error. Preserve vault corrections before exporting
again, because export writes the store's current content into its notes.

## File and failure handling

Only Markdown files under `memories/` are considered. MOC, lessons, crystals and
sessions are ignored. Missing notes never delete or forget memory. Symlinks are
rejected; traversal is limited to 32 directory levels, 10,000 entries, 2 MiB per
note and 64 MiB per import. Malformed or unsupported frontmatter and planning
errors stop the import before memory writes.

The memory writer rechecks the planned head under its write lock. A concurrent
store edit is reported without overwriting that edit. Runtime failures can occur
after earlier notes were saved, so the operation is not a transaction across the
whole vault. Inspect `applied`, `errors` and memory history before retrying a failed
request; a lost response can follow a successful write. A confirmed memory saved
without provenance is reported with its ID and applied count; a lost write
response is marked `writeOutcomeUncertain`. The importer never edits
or deletes vault files.
