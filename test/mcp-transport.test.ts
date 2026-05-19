import { describe, it, expect, vi } from "vitest";
import {
  createMessageParser,
  formatResponse,
  processLine,
  type JsonRpcResponse,
  type RequestHandler,
} from "../src/mcp/transport.js";

function collector() {
  const out: JsonRpcResponse[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    writeOut: (r: JsonRpcResponse) => out.push(r),
    writeErr: (m: string) => err.push(m),
  };
}

const okHandler: RequestHandler = async (method) => ({ method });

describe("processLine — request path", () => {
  it("emits a response for a request with id", async () => {
    const c = collector();
    await processLine(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      okHandler,
      c.writeOut,
      c.writeErr,
    );
    expect(c.out).toHaveLength(1);
    expect(c.out[0]).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { method: "initialize" },
    });
  });

  it("emits an error response when the handler throws on a request", async () => {
    const c = collector();
    const throwingHandler: RequestHandler = async () => {
      throw new Error("boom");
    };
    await processLine(
      JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }),
      throwingHandler,
      c.writeOut,
      c.writeErr,
    );
    expect(c.out).toHaveLength(1);
    expect(c.out[0].id).toBe(7);
    expect(c.out[0].error?.code).toBe(-32603);
    expect(c.out[0].error?.message).toBe("boom");
  });
});

describe("processLine — notification path (#129)", () => {
  it("does NOT emit a response for a notification (no id field)", async () => {
    const c = collector();
    const handlerCalled = vi.fn(async () => ({ shouldNotEscape: true }));
    await processLine(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
      handlerCalled,
      c.writeOut,
      c.writeErr,
    );
    expect(handlerCalled).toHaveBeenCalledOnce();
    expect(c.out).toHaveLength(0);
    expect(c.err).toHaveLength(0);
  });

  it("does NOT emit a response for a notification with id: null", async () => {
    const c = collector();
    await processLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        method: "notifications/cancelled",
      }),
      okHandler,
      c.writeOut,
      c.writeErr,
    );
    expect(c.out).toHaveLength(0);
  });

  it("logs to stderr but does NOT emit a response when a notification handler throws", async () => {
    const c = collector();
    const throwingHandler: RequestHandler = async () => {
      throw new Error("notification crash");
    };
    await processLine(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
      throwingHandler,
      c.writeOut,
      c.writeErr,
    );
    expect(c.out).toHaveLength(0);
    expect(c.err).toHaveLength(1);
    expect(c.err[0]).toContain("notification handler error");
    expect(c.err[0]).toContain("notification crash");
  });
});

describe("processLine — malformed input", () => {
  it("emits a parse error with id: null for invalid JSON", async () => {
    const c = collector();
    await processLine("not-json", okHandler, c.writeOut, c.writeErr);
    expect(c.out).toHaveLength(1);
    expect(c.out[0].id).toBeNull();
    expect(c.out[0].error?.code).toBe(-32700);
    expect(c.out[0].error?.message).toBe("Parse error");
  });

  it("ignores empty / whitespace-only lines", async () => {
    const c = collector();
    await processLine("", okHandler, c.writeOut, c.writeErr);
    await processLine("   \t  ", okHandler, c.writeOut, c.writeErr);
    expect(c.out).toHaveLength(0);
    expect(c.err).toHaveLength(0);
  });

  it("emits an Invalid Request error when a request has an id but no jsonrpc", async () => {
    const c = collector();
    await processLine(
      JSON.stringify({ id: 1, method: "tools/list" }),
      okHandler,
      c.writeOut,
      c.writeErr,
    );
    expect(c.out).toHaveLength(1);
    expect(c.out[0].id).toBe(1);
    expect(c.out[0].error?.code).toBe(-32600);
  });

  it("silently drops a malformed message that has no id (treated as notification)", async () => {
    const c = collector();
    await processLine(
      JSON.stringify({ method: "broken" }),
      okHandler,
      c.writeOut,
      c.writeErr,
    );
    // No jsonrpc field, no id — drop without responding.
    expect(c.out).toHaveLength(0);
  });

  it("silently drops a malformed message with a non-primitive id (can't safely echo)", async () => {
    const c = collector();
    await processLine(
      JSON.stringify({ id: { nested: true }, method: "broken" }),
      okHandler,
      c.writeOut,
      c.writeErr,
    );
    // Malformed shape + non-primitive id — can't echo id back, drop silently.
    expect(c.out).toHaveLength(0);
  });
});

describe("processLine — id type validation (JSON-RPC §4)", () => {
  it("rejects a request whose id is an object with -32600 and id: null", async () => {
    const c = collector();
    const handlerCalled = vi.fn(okHandler);
    await processLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: { bogus: true },
        method: "tools/list",
      }),
      handlerCalled,
      c.writeOut,
      c.writeErr,
    );
    expect(handlerCalled).not.toHaveBeenCalled();
    expect(c.out).toHaveLength(1);
    expect(c.out[0].id).toBeNull();
    expect(c.out[0].error?.code).toBe(-32600);
    expect(c.out[0].error?.message).toContain("id must be");
  });

  it("rejects a request whose id is an array", async () => {
    const c = collector();
    const handlerCalled = vi.fn(okHandler);
    await processLine(
      JSON.stringify({ jsonrpc: "2.0", id: [1, 2], method: "tools/list" }),
      handlerCalled,
      c.writeOut,
      c.writeErr,
    );
    expect(handlerCalled).not.toHaveBeenCalled();
    expect(c.out).toHaveLength(1);
    expect(c.out[0].id).toBeNull();
    expect(c.out[0].error?.code).toBe(-32600);
  });

  it("rejects a request whose id is a boolean", async () => {
    const c = collector();
    const handlerCalled = vi.fn(okHandler);
    await processLine(
      JSON.stringify({ jsonrpc: "2.0", id: true, method: "tools/list" }),
      handlerCalled,
      c.writeOut,
      c.writeErr,
    );
    expect(handlerCalled).not.toHaveBeenCalled();
    expect(c.out).toHaveLength(1);
    expect(c.out[0].id).toBeNull();
    expect(c.out[0].error?.code).toBe(-32600);
  });

  it("accepts a request with string id", async () => {
    const c = collector();
    await processLine(
      JSON.stringify({ jsonrpc: "2.0", id: "abc-123", method: "ping" }),
      okHandler,
      c.writeOut,
      c.writeErr,
    );
    expect(c.out).toHaveLength(1);
    expect(c.out[0].id).toBe("abc-123");
    expect(c.out[0].result).toEqual({ method: "ping" });
  });
});

describe("stdio framing", () => {
  it("parses Content-Length framed MCP messages split across chunks", () => {
    const messages: string[] = [];
    const parser = createMessageParser((message) => messages.push(message));
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const framed = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;

    parser.push(framed.slice(0, 12));
    parser.push(framed.slice(12));

    expect(messages).toEqual([body]);
    expect(parser.isFramed()).toBe(true);
  });

  it("parses newline-delimited JSON for existing clients", () => {
    const messages: string[] = [];
    const parser = createMessageParser((message) => messages.push(message));
    const first = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const second = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });

    parser.push(`${first}\n${second}\n`);

    expect(messages).toEqual([first, second]);
    expect(parser.isFramed()).toBe(false);
  });

  it("formats responses with Content-Length framing when requested", () => {
    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true },
    };
    const formatted = formatResponse(response, true);

    expect(Array.isArray(formatted)).toBe(true);
    if (!Array.isArray(formatted)) throw new Error("expected framed response");
    const header = formatted[0].toString("ascii");
    const body = formatted[1].toString("utf8");

    expect(header).toBe(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`);
    expect(JSON.parse(body)).toEqual(response);
  });
});
