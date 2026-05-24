// Unit tests for parseNetstatListeningPids — the Windows port-detection
// parser used by `agentmemory stop [--force]`.
//
// We exercise:
//   - IPv4 / IPv6 / loopback local addresses
//   - LISTENING vs ESTABLISHED filtering
//   - selfPid exclusion (so the CLI does not signal its own parent)
//   - locale-translated state strings (de-DE: "ABHÖREN") — covered by the
//     foreign-address heuristic, not the literal "LISTENING" word
//   - blank / garbage input

import { describe, it, expect } from "vitest";
import { parseNetstatListeningPids } from "../src/cli.js";

describe("parseNetstatListeningPids", () => {
  it("returns the listening PID for IPv4 and IPv6 sockets on the requested port", () => {
    const sample = [
      "",
      "Active Connections",
      "",
      "  Proto  Local Address          Foreign Address        State           PID",
      "  TCP    0.0.0.0:3111           0.0.0.0:0              LISTENING       39672",
      "  TCP    [::]:3111              [::]:0                 LISTENING       39672",
      "  TCP    127.0.0.1:3113         0.0.0.0:0              LISTENING       26320",
      "",
    ].join("\r\n");
    expect(parseNetstatListeningPids(sample, 3111, /*selfPid*/ 999).sort()).toEqual([39672]);
    expect(parseNetstatListeningPids(sample, 3113, 999)).toEqual([26320]);
  });

  it("ignores ESTABLISHED, TIME_WAIT, CLOSE_WAIT and other non-listening states", () => {
    // The browser-tab ghost connection symptom: an old SSE client lingering
    // in CLOSE_WAIT on the viewer port. The parser must NOT report it as a
    // listening owner, otherwise --force would kill an unrelated client.
    const sample = [
      "  TCP    127.0.0.1:3113         127.0.0.1:54321        ESTABLISHED     12345",
      "  TCP    127.0.0.1:3113         127.0.0.1:54322        CLOSE_WAIT      12345",
      "  TCP    127.0.0.1:3113         0.0.0.0:0              LISTENING       54000",
    ].join("\n");
    expect(parseNetstatListeningPids(sample, 3113, 1)).toEqual([54000]);
  });

  it("excludes the caller's own PID", () => {
    const sample = "  TCP    0.0.0.0:3111   0.0.0.0:0   LISTENING   42";
    expect(parseNetstatListeningPids(sample, 3111, /*selfPid*/ 42)).toEqual([]);
  });

  it("does not confuse :3111 with :31111 or :13111", () => {
    const sample = [
      "  TCP    0.0.0.0:31111   0.0.0.0:0   LISTENING   1001",
      "  TCP    0.0.0.0:13111   0.0.0.0:0   LISTENING   1002",
      "  TCP    0.0.0.0:3111    0.0.0.0:0   LISTENING   1003",
    ].join("\n");
    expect(parseNetstatListeningPids(sample, 3111, 0)).toEqual([1003]);
  });

  it("deduplicates IPv4 + IPv6 entries with the same PID", () => {
    const sample = [
      "  TCP    0.0.0.0:3111   0.0.0.0:0   LISTENING   7777",
      "  TCP    [::]:3111      [::]:0      LISTENING   7777",
    ].join("\n");
    expect(parseNetstatListeningPids(sample, 3111, 0)).toEqual([7777]);
  });

  it("returns an empty array for empty, garbage, or UDP-only input", () => {
    expect(parseNetstatListeningPids("", 3111, 0)).toEqual([]);
    expect(parseNetstatListeningPids("nothing here", 3111, 0)).toEqual([]);
    expect(
      parseNetstatListeningPids("  UDP    0.0.0.0:3111   *:*   1234", 3111, 0),
    ).toEqual([]);
  });

  it("tolerates locale-translated state words because we key off the peer address", () => {
    // de-DE netstat renders "LISTENING" as "ABHÖREN". The parser must still
    // recognise the row as a listener via the unspecified-peer heuristic.
    const sample = "  TCP    0.0.0.0:3111   0.0.0.0:0   ABHÖREN   8181";
    expect(parseNetstatListeningPids(sample, 3111, 0)).toEqual([8181]);
  });
});
