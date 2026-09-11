# 0003 Monorepo Subpath Tagging and Dual Lookup Fallback

## Status
Accepted

## Context
When working in a monorepo, multiple packages or sub-applications reside under a single Git repository root. If partitioned strictly by package directory, architectural patterns, conventions, and global ADRs cannot be shared across packages. Conversely, if partitioned solely by Git root without granularity, queries for a specific package are diluted with irrelevant package context. Additionally, legacy database entries in `state_store.db` were created with simple directory basenames, which would be orphaned under a hard cutover.

## Decision
1. Monorepos adopt a unified `Project Key` based on the Git repository root (e.g. `acme-monolith`), ensuring system-wide architectural rules and lessons are shared.
2. Episodic observations record an optional `subpath` metadata tag representing the relative path within the monorepo (e.g. `packages/auth`) for targeted filtering when needed.
3. Queries implement a `Dual-Lookup Fallback`: memory recall first queries by the canonical `Project Key`. If results are empty or insufficient, it transparently queries by legacy project basename so existing memories remain accessible with zero migration downtime.

## Consequences
- Preserves full backward compatibility with existing databases without requiring data mutation.
- Maintains unified project intelligence while retaining sub-package traceability.
