import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../src/logger.js";
import { createStdioTransport } from "../src/mcp/transport.js";

describe("logger output streams", () => {
  afterEach(() => {
    delete process.env["AGENTMEMORY_MCP_STDIO__"];
    vi.restoreAllMocks();
  });

  it("writes info and warning messages to stdout and errors to stderr", () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    logger.info("captured", { id: "memory-1" });
    logger.warn("retrying");
    logger.error("failed");

    expect(stdoutWrite.mock.calls.map(([line]) => line)).toEqual([
      '[agentmemory] info captured {"id":"memory-1"}\n',
      "[agentmemory] warn retrying\n",
    ]);
    expect(stderrWrite.mock.calls.map(([line]) => line)).toEqual([
      "[agentmemory] error failed\n",
    ]);
  });

  it("keeps routine logs off stdout while MCP stdio is active", () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const firstTransport = createStdioTransport(async () => ({}));
    const secondTransport = createStdioTransport(async () => ({}));
    firstTransport.start();
    secondTransport.start();

    logger.info("request handled");
    logger.warn("request retried");
    firstTransport.stop();
    logger.warn("second transport active");
    secondTransport.stop();
    logger.info("worker log");

    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    expect(stdoutWrite).toHaveBeenCalledWith("[agentmemory] info worker log\n");
    expect(stderrWrite).toHaveBeenNthCalledWith(1, "[agentmemory] info request handled\n");
    expect(stderrWrite).toHaveBeenNthCalledWith(2, "[agentmemory] warn request retried\n");
    expect(stderrWrite).toHaveBeenNthCalledWith(3, "[agentmemory] warn second transport active\n");
  });
});
