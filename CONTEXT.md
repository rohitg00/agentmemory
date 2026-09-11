# AgentMemory Domain Model

Autonomous workspace identity, memory partitioning, and observation lifecycle model for AgentMemory.

## Language

### Workspace Identity & Scoping

**Project Key**:
The unique partition identifier derived from Git remote origin or repository root path hash, used by the storage engine, vector index, and hooks to isolate memories, lessons, and slots.
_Avoid_: Project name, project ID, folder path, app ID

**Project Display Name**:
The human-friendly label (typically repository basename) rendered in the user interface and session dashboards.
_Avoid_: Project key, slug, path identifier

**Workspace Identity**:
The dynamically resolved pairing of a Project Key and Project Display Name inferred at runtime from environment inspection without manual configuration.
_Avoid_: Export configuration, manual project tagging

**Canonical Remote Slug**:
A Project Key formatted as `host-owner-repo` (e.g. `github.com-acme-monolith`) extracted from Git remotes (`upstream` preferred over `origin`).
_Avoid_: Simple owner-repo without host, raw git remote URL, un-normalized remote string

**Local Repository Slug**:
A deterministic, canonical `realpath`-derived Project Key (e.g. `Volumes-DB-Work-Monolith`) used as fallback when a workspace lacks a Git remote.
_Avoid_: Random UUID, arbitrary hash, raw un-normalized path

**Subpackage Tag**:
A relative path metadata tag attached to episodic observations when executed from within a subfolder or package of a monorepo.
_Avoid_: Sub-project ID, nested workspace key, split repository identity

**Dynamic Aliasing**:
The query strategy that attempts retrieval using the canonical Project Key first, then falls back to match legacy un-scoped project names so historical memories remain accessible.
_Avoid_: Hard cutover, forced migration, destructive rename

**Gradual Self-Healing**:
The opportunistic migration mechanism where consolidation and reflection routines re-tag legacy memories matching the Project Display Name with the canonical Project Key without locking or batch downtime.
_Avoid_: Cold batch migration, full database rewrite

**Identity Resolution Cache**:
An in-memory map keyed by canonical directory path that memoizes the resolved Workspace Identity to eliminate repeated Git process spawning during rapid hook execution.
_Avoid_: File-based cache, process-wide global lock

### Observation & Memory Lifecycle

**Episodic Observation**:
An immutable, append-only record of a discrete tool invocation, shell command, or conversational turn within a session.
_Avoid_: Log entry, event record, trace

**Session Checkpoint**:
A synthesized, intermediate consolidation snapshot produced periodically during long sessions to compress past observations into bounded working memory.
_Avoid_: Intermediate dump, rolling log, mini-summary

**Working Context**:
The composite runtime context injected into prompts, formed by combining the latest Session Checkpoint, top semantically recalled memories/ADRs, and a trailing window of recent episodic observations.
_Avoid_: Context dump, full history, raw prompt payload

**Compaction Watermark**:
The threshold (e.g. 200 uncompacted observations or 30 seconds of conversational idle time) that triggers an asynchronous micro-compaction cycle.
_Avoid_: Batch timer, hard cap, limit trigger
