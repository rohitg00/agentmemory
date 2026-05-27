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
- The Claude Code plugin under `plugin/`.

Out of scope:

- Third-party MCP clients consuming agentmemory — report to those projects.
- `iii-sdk` upstream — report to the iii project.
- The marketing site under `website/` unless the issue affects user security (XSS against visitors, credential leak in build output).

## Supply-chain stance

agentmemory ships pre-built artifacts in the npm tarball — `dist/` is bundled at publish time, not built from `node_modules` at install time. The package's runtime dependency tree is intentionally small (6 production deps: `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`, `@clack/prompts`, `dotenv`, `iii-sdk`, `zod`) plus an optional set guarded behind `optionalDependencies` for embeddings.

**No lockfile is committed** (#540). The reasoning:

- The npm tarball ships pre-built `dist/` — fresh installs don't compile from source, so no lockfile is consulted at the user's install step.
- The lockfile only affects contributor-local builds. Pinning it would shift the supply-chain attack surface from "what npm resolves today" to "what was resolved when the lockfile was last regenerated," which is a different tradeoff, not strictly better.
- We use SemVer ranges (`^x.y.z`) on the published deps so security patches reach users without a re-release.

If you ship agentmemory inside a hardened pipeline that requires reproducible installs, the recommended path is:

1. `npm install --legacy-peer-deps` against the published tarball in a controlled environment.
2. `npm shrinkwrap` to produce a versioned `npm-shrinkwrap.json` that travels with your deployment.
3. Audit `node_modules/` once at that point and republish internally.

CI runs `npm install --package-lock-only --legacy-peer-deps --no-audit --no-fund` then `npm ci` against that generated lockfile, so every test job builds against a fully resolved tree. The lockfile is regenerated on each CI run rather than checked in, which keeps the published tarball aligned with whatever SemVer-compatible patch level was current at release time.

Supply-chain monitoring we already do:

- Dependabot opens PRs for every minor/patch bump on the production dep list (visible in the open PRs).
- Every PR runs the full test suite on ubuntu-latest + macos-latest, Node 20 + 22, before any merge.
- `optionalDependencies` (`@xenova/transformers`, `onnxruntime-node`, etc.) are guarded by `try { await import("...") } catch` so a missing or compromised optional dep cannot break the core runtime path.

If you find a malicious package in our dep tree, file via the GHSA flow at the top of this document — that's the fastest path to a fixed release on npm.

## Past advisories

See the [`.github/security-advisories/`](./.github/security-advisories) directory for advisory drafts. Published advisories (with assigned GHSA IDs) live at <https://github.com/rohitg00/agentmemory/security/advisories>.

## Safe harbor

Good-faith research, reported privately, does not get legal heat from the project. Research targeting third-party deployments of agentmemory is not covered — that's between you and the deployer.
