# Mesh URL Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mesh peer URL validation fail closed on DNS failures and consistently reject private, loopback, link-local, and unspecified network targets.

**Architecture:** Keep the security invariant inside `src/functions/mesh.ts` so both registration and sync recheck share one boundary. Use deterministic Vitest DNS mocks in `test/mesh.test.ts` to prove reject/allow behavior without live DNS.

**Tech Stack:** TypeScript ESM, Node `dns.promises.lookup`, Node `net.isIP`, Vitest.

---

Task id: `2026-06-13-mesh-url-validation`
Spec path: none
Task record: `docs/todos/2026-06-13-mesh-url-validation/todo.md`

## Files

- Modify: `src/functions/mesh.ts`
  - Normalize hostnames, including bracketed IPv6 literals.
  - Replace narrow `isPrivateIP()` with a broader blocked-address predicate.
  - Make DNS lookup errors and empty DNS answers fail closed.
  - Bound DNS validation latency and fail closed on timeout.
- Modify: `test/mesh.test.ts`
  - Mock `node:dns/promises.lookup`.
  - Add regression tests for DNS failure, DNS timeout, `.localhost`, DNS private answers, DNS public answers, IP literals, sync recheck, Authorization header preservation, and redirect blocking.

## Task 1: Add Deterministic DNS Validation Tests

- [ ] Add a `node:dns/promises` mock before importing `registerMeshFunction`.

```ts
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));
```

- [ ] Import the mocked lookup and create a helper with public DNS default behavior.

```ts
import { lookup } from "node:dns/promises";

const lookupMock = vi.mocked(lookup);

function mockDns(addresses: string[]) {
  lookupMock.mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));
}
```

- [ ] In `beforeEach`, set the default DNS result to a public address so existing `peer*.example.com` tests do not use live DNS.

```ts
lookupMock.mockReset();
mockDns(["203.0.113.10"]);
```

- [ ] Add registration tests under `describe("mesh-register")`:
  - DNS lookup rejection blocks registration.
  - DNS lookup timeout blocks registration.
  - `.localhost` subdomains block registration without DNS.
  - Public DNS answers allow registration.
  - Any private DNS answer blocks registration.
  - Private, loopback, link-local, unspecified, and IPv4-mapped IP literals are blocked.
  - Hex-normalized IPv4-mapped IPv6 literals such as `http://[::ffff:c0a8:101]` are blocked.
  - Public IPv4 and IPv6 literals are allowed, including public boundary addresses adjacent to blocked IPv4 ranges.

- [ ] Run the focused tests and confirm at least one new test fails before implementation.

```sh
npm test -- test/mesh.test.ts
```

Expected before code fix: DNS failure and several IP literal/private DNS cases fail because current validation is fail-open or too narrow.

## Task 2: Implement Fail-Closed URL Validation

- [ ] Replace the narrow IP helper with explicit host normalization and blocked-address helpers.

```ts
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^\[(.*)\]$/, "$1");
}
```

- [ ] Implement IPv4 blocking for loopback `127.0.0.0/8`, unspecified `0.0.0.0`, RFC1918, and link-local `169.254.0.0/16`.
- [ ] Implement IPv4 blocking for non-global special-use ranges such as CGNAT, benchmarking, documentation, multicast, and reserved ranges.

- [ ] Implement IPv6 blocking for loopback `::1`, unspecified `::`, link-local `fe80::/10`, ULA `fc00::/7`, and IPv4-mapped blocked IPv4 values.

- [ ] Decode IPv4-mapped IPv6 tails in both dotted and hex-normalized forms before applying the IPv4 blocklist.

- [ ] Update `isAllowedUrl()` so hostnames return `false` if DNS lookup rejects or returns no records.
- [ ] Wrap DNS lookup in a 5 second timeout so hung resolver calls fail closed before registration or sync can stall indefinitely.

```ts
try {
  const resolved = await lookup(host, { all: true });
  if (resolved.length === 0) return false;
  if (resolved.some((r) => isBlockedNetworkAddress(r.address))) return false;
} catch {
  return false;
}
```

- [ ] Preserve existing protocol and credentials rejection.

- [ ] Keep the existing sync-time recheck before any push or pull work.

## Task 3: Add Sync Recheck And Fetch Option Coverage

- [ ] Add a sync test that registers a peer while DNS resolves public, then changes the DNS mock to a private address before `mem::mesh-sync`.
- [ ] Add a sync test that registers a peer while DNS resolves public, then changes the DNS mock to a non-global special-use IPv4 address before `mem::mesh-sync`.
- [ ] Add a sync test that registers a peer while DNS resolves public, then makes DNS hang before `mem::mesh-sync` and confirms the validation timeout blocks fetch.

Expected result:

```ts
expect(result.success).toBe(true);
expect(result.results[0].errors).toContain("peer URL blocked: private/local address not allowed");
expect(fetchMock).not.toHaveBeenCalled();
```

- [ ] Extend the allowed sync test to assert `redirect: "error"` remains present in the fetch options.

Expected result:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  "https://peer2.example.com/agentmemory/mesh/receive",
  expect.objectContaining({
    redirect: "error",
    headers: expect.objectContaining({ Authorization: "Bearer mesh-secret" }),
  }),
);
```

- [ ] Add a pull sync test that asserts `/agentmemory/mesh/export?since=` includes the bearer header and `redirect: "error"`.

Expected result:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  "https://peer3.example.com/agentmemory/mesh/export?since=",
  expect.objectContaining({
    redirect: "error",
    headers: expect.objectContaining({ Authorization: "Bearer mesh-secret" }),
  }),
);
```

## Accepted Residual Risk

This plan intentionally does not replace `fetch(peer.url)` with a custom DNS-pinned HTTP client. The approved fix direction requires DNS resolution to fail closed and private/link-local/loopback resolutions to stay blocked. Revalidation before sync/fetch narrows registration-to-sync rebinding, and `redirect: "error"` blocks redirect pivots. A hostname can still theoretically resolve public during validation and private during the subsequent `fetch` resolver call. Fully closing that requires a larger network-boundary change such as DNS pinning in the connection layer, a custom HTTP client that preserves TLS SNI/certificate validation while connecting to a validated IP, or deployment egress controls.

## Task 4: Verification And Cleanup

- [ ] Run focused mesh tests.

```sh
npm test -- test/mesh.test.ts
```

Expected: pass.

- [ ] Run TypeScript build.

```sh
npm run build
```

Expected: pass.

- [ ] Run repo test suite.

```sh
npm test
```

Expected: pass.

- [ ] Run Semgrep gate for this security code change.

```sh
semgrep scan --config p/default --error --metrics=off .
```

Expected: pass, or record any findings and fix/triage them before handoff.

- [ ] If staging/committing, run staged Gitleaks before commit.

```sh
gitleaks protect --staged --redact
```

Expected: pass.

- [ ] Update `docs/todos/2026-06-13-mesh-url-validation/todo.md` with verification evidence, residual DNS TOCTOU risk, and final matrix statuses.

## Self-Review

- Spec coverage: covered DNS failure, private DNS, public DNS, non-global special-use IPv4 ranges, IP literals including hex IPv4-mapped IPv6, sync recheck, push/pull redirect behavior, and residual TOCTOU documentation.
- Placeholder scan: no `TBD` or unresolved implementation placeholders remain.
- Type consistency: tests target current `mockSdk`, `mockKV`, `registerMeshFunction`, and `MeshPeer` patterns already used in `test/mesh.test.ts`.
