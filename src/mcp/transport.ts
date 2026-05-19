export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type RequestHandler = (
  method: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

export interface StdioMessageParser {
  push: (chunk: Buffer | string) => void;
  isFramed: () => boolean;
}

// JSON-RPC 2.0 notifications are messages without an `id` field. The spec
// (and the MCP transport contract) requires the server to NOT send a
// response for notifications. Some clients tolerate spurious responses;
// stricter clients (e.g. Codex CLI) treat them as protocol violations and
// close the transport. See agentmemory#129.
function isNotification(req: JsonRpcRequest): boolean {
  return req.id === undefined || req.id === null;
}

// Per JSON-RPC 2.0 §4, a valid request id must be a String, Number, or Null
// (Null is technically only allowed in responses; in requests, omitting id
// is the convention for notifications, which we treat the same as null).
// Any other runtime type (object, array, boolean) is an Invalid Request.
function isValidId(id: unknown): id is string | number | null | undefined {
  return (
    id === undefined ||
    id === null ||
    typeof id === "string" ||
    typeof id === "number"
  );
}

// Exported for unit tests so the line-handling logic is exercised
// independently of process.stdin / process.stdout.
export async function processLine(
  line: string,
  handler: RequestHandler,
  writeOut: (response: JsonRpcResponse) => void,
  writeErr: (msg: string) => void = (msg) => process.stderr.write(msg),
): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    writeOut({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    return;
  }

  const request = parsed as JsonRpcRequest;
  const rawId = (request as { id?: unknown } | null)?.id;

  // Invalid request shape (missing/wrong jsonrpc, non-string method).
  if (
    !request ||
    typeof request !== "object" ||
    request.jsonrpc !== "2.0" ||
    typeof request.method !== "string"
  ) {
    // Echo the id back only if it's a valid string/number. Notifications
    // (missing/null id) and malformed ids both drop silently — we don't
    // want to respond to something that could be a notification, and we
    // can't invent an id for a malformed one.
    if (typeof rawId === "string" || typeof rawId === "number") {
      writeOut({
        jsonrpc: "2.0",
        id: rawId,
        error: { code: -32600, message: "Invalid Request" },
      });
    }
    return;
  }

  // Request shape is valid but id may still be of the wrong type
  // (object, array, boolean). Per the spec, that's an Invalid Request.
  // Respond with id: null because we can't safely echo a non-JSON-RPC id.
  if (!isValidId(rawId)) {
    writeOut({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request: id must be string, number, or null" },
    });
    return;
  }

  const notification = isNotification(request);

  try {
    const result = await handler(request.method, request.params || {});
    if (notification) return;
    writeOut({
      jsonrpc: "2.0",
      id: request.id as string | number,
      result,
    });
  } catch (err) {
    if (notification) {
      writeErr(
        `[mcp-transport] notification handler error for ${request.method}: ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      );
      return;
    }
    writeOut({
      jsonrpc: "2.0",
      id: request.id as string | number,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

function findHeaderEnd(buffer: Buffer): { headerEnd: number; bodyStart: number } | null {
  const crlf = buffer.indexOf("\r\n\r\n");
  const lf = buffer.indexOf("\n\n");
  if (crlf === -1 && lf === -1) return null;
  if (crlf !== -1 && (lf === -1 || crlf <= lf)) {
    return { headerEnd: crlf, bodyStart: crlf + 4 };
  }
  return { headerEnd: lf, bodyStart: lf + 2 };
}

function parseContentLength(header: string): number | null {
  for (const line of header.split(/\r?\n/)) {
    const match = line.match(/^content-length:\s*(\d+)\s*$/i);
    if (match) return Number(match[1]);
  }
  return null;
}

export function formatResponse(
  response: JsonRpcResponse,
  framed: boolean,
): string | Buffer[] {
  const body = JSON.stringify(response);
  if (!framed) return `${body}\n`;
  const bytes = Buffer.from(body, "utf8");
  return [Buffer.from(`Content-Length: ${bytes.length}\r\n\r\n`, "ascii"), bytes];
}

export function createMessageParser(
  onMessage: (message: string) => void,
  writeErr: (msg: string) => void = (msg) => process.stderr.write(msg),
): StdioMessageParser {
  let buffer = Buffer.alloc(0);
  let framed = false;

  function processBuffer(): void {
    while (buffer.length > 0) {
      if (buffer[0] === 10 || buffer[0] === 13) {
        buffer = buffer.subarray(1);
        continue;
      }

      const preview = buffer.toString("ascii", 0, Math.min(buffer.length, 32));
      if (/^content-length:/i.test(preview)) {
        const header = findHeaderEnd(buffer);
        if (!header) return;

        const headerText = buffer.subarray(0, header.headerEnd).toString("ascii");
        const contentLength = parseContentLength(headerText);
        if (contentLength === null) {
          writeErr("[mcp-transport] missing Content-Length header\n");
          buffer = buffer.subarray(header.bodyStart);
          continue;
        }

        const messageEnd = header.bodyStart + contentLength;
        if (buffer.length < messageEnd) return;

        framed = true;
        const message = buffer.subarray(header.bodyStart, messageEnd).toString("utf8");
        buffer = buffer.subarray(messageEnd);
        onMessage(message);
        continue;
      }

      const newline = buffer.indexOf(10);
      if (newline === -1) return;
      const line = buffer
        .subarray(0, newline)
        .toString("utf8")
        .replace(/\r$/, "");
      buffer = buffer.subarray(newline + 1);
      onMessage(line);
    }
  }

  return {
    push(chunk) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
      buffer = Buffer.concat([buffer, bytes]);
      processBuffer();
    },
    isFramed() {
      return framed;
    },
  };
}

export function createStdioTransport(handler: RequestHandler): {
  start: () => void;
  stop: () => void;
} {
  let parser: StdioMessageParser | null = null;
  let queue = Promise.resolve();

  const writeResponse = (response: JsonRpcResponse) => {
    const formatted = formatResponse(response, parser?.isFramed() ?? false);
    if (typeof formatted === "string") {
      process.stdout.write(formatted);
      return;
    }
    for (const chunk of formatted) {
      process.stdout.write(chunk);
    }
  };

  const onData = (chunk: Buffer) => parser?.push(chunk);

  return {
    start() {
      parser = createMessageParser((message) => {
        queue = queue.then(() => processLine(message, handler, writeResponse));
        void queue.catch((err) => {
          process.stderr.write(
            `[mcp-transport] request processing failed: ${
              err instanceof Error ? err.message : String(err)
            }\n`,
          );
        });
      });
      process.stdin.on("data", onData);
    },
    stop() {
      process.stdin.off("data", onData);
      parser = null;
    },
  };
}
