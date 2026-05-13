# Security Policy

## Reporting a vulnerability

**Do not open a public GitHub issue for a suspected vulnerability.**

Use one of:

- **GitHub Security Advisories (preferred)** — private report form at <https://github.com/rohitg00/agentmemory/security/advisories/new>. GitHub routes the report to the Maintainers, assigns a GHSA identifier, and keeps you in a private thread until the fix ships. All sensitive details (stack traces, credentials, exploit payloads) stay end-to-end within GitHub's security infrastructure — use this channel whenever possible.
- **Encrypted email (fallback)** — if GitHub is unavailable or the issue cannot be described in the GHSA form, send an encrypted message to `ghumare64@gmail.com` with subject `agentmemory security`. Encrypt with the Maintainer public keys published at <https://github.com/rohitg00.gpg> (PGP) and <https://github.com/rohitg00.keys> (SSH for verification); attach your own public key so we can reply encrypted. Plaintext email is accepted only as a last resort — prefer GHSA.

Include, at minimum:

- agentmemory version (`npm view @agentmemory/agentmemory version` against your install).
- The affected surface — REST endpoint, MCP tool, hook, CLI flag, or filesystem layout.
- A minimal reproduction — prefer one curl invocation or one MCP tool call plus the environment state required.
- Impact, in your own words.

## What we do with it

1. **Acknowledge** within 72 hours (target: 24).
2. **Triage** — confirm reproduction, assign a severity using CVSS 3.1, and give you a rough timeline.
3. **Fix** in a private branch. Draft a GitHub Security Advisory with the patched version, CWE, CVSS vector, affected versions, and attribution to you (unless you prefer anonymity).
4. **Coordinate disclosure** — we agree a disclosure date with you. Default window is 30 days from acknowledgment for straightforward vulnerabilities, up to 90 days for ones that need a deep refactor.
5. **Publish** — release the patched version on npm, publish the advisory, update `CHANGELOG.md` under a `### Security` section for the release, notify downstream scanners.

## Supported versions

| Version | Security fixes? |
|-|-|
| Latest minor (currently `0.9.x`) | Yes |
| Previous minor (currently `0.8.x`) | Critical / High severity only, for 90 days after a new minor is released |
| Older | No |

At v1.0 this policy switches to a stated LTS window per the roadmap.

## Scope

In scope:

- The `@agentmemory/agentmemory` server (REST + MCP surface, hook handlers, state store).
- The `@agentmemory/mcp` standalone MCP server.
- The `@agentmemory/fs-watcher` connector.
- First-party integrations under `integrations/` (`hermes/`, `openclaw/`, `filesystem-watcher/`).
- Plugins under `plugin/` (Claude Code, Codex CLI, Factory Droids).

Out of scope:

- Third-party MCP clients consuming agentmemory — report to those projects.
- `iii-sdk` upstream — report to the iii project.
- The marketing site under `website/` unless the issue affects user security (XSS against visitors, credential leak in build output).

## Past advisories

See the [`.github/security-advisories/`](./.github/security-advisories) directory for advisory drafts. Published advisories (with assigned GHSA IDs) live at <https://github.com/rohitg00/agentmemory/security/advisories>.

## Safe harbor

Good-faith research, reported privately, does not get legal heat from the project. Research targeting third-party deployments of agentmemory is not covered — that's between you and the deployer.
