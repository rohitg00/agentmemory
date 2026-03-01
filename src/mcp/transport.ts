import { createInterface } from "node:readline";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type RequestHandler = (
  method: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

export function createStdioTransport(handler: RequestHandler): {
  start: () => void;
  stop: () => void;
} {
  const rl = createInterface({ input: process.stdin });

  const onLine = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed);
    } catch {
      const error: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: 0,
        error: { code: -32700, message: "Parse error" },
      };
      process.stdout.write(JSON.stringify(error) + "\n");
      return;
    }

    try {
      const result = await handler(request.method, request.params || {});
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
      process.stdout.write(JSON.stringify(response) + "\n");
    } catch (err) {
      const response: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err),
        },
      };
      process.stdout.write(JSON.stringify(response) + "\n");
    }
  };

  return {
    start() {
      rl.on("line", onLine);
    },
    stop() {
      rl.close();
    },
  };
}
