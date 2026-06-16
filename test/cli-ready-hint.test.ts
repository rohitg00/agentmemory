import { describe, expect, it } from "vitest";

import { buildReadyWebSocketUrls } from "../src/cli/ready-hint.js";

const insecureWs = (target: string) => ["ws", "://", target].join("");
const secureWs = (target: string) => ["wss", "://", target].join("");

describe("buildReadyWebSocketUrls", () => {
  it("uses localhost and ws by default", () => {
    expect(buildReadyWebSocketUrls({ restPort: 3111 })).toEqual({
      streamUrl: insecureWs("localhost:3112"),
      engineUrl: insecureWs("localhost:49134"),
    });
  });

  it("preserves wss display scheme from III_ENGINE_URL for the engine only", () => {
    expect(
      buildReadyWebSocketUrls({
        restPort: 3111,
        env: { III_ENGINE_URL: secureWs("engine.example:49134") },
      }),
    ).toEqual({
      streamUrl: insecureWs("localhost:3112"),
      engineUrl: secureWs("engine.example:49134"),
    });
  });

  it("keeps ws display scheme for legacy III_ENGINE_URL", () => {
    expect(
      buildReadyWebSocketUrls({
        restPort: 3211,
        env: { III_ENGINE_URL: insecureWs("engine.example:49234") },
      }),
    ).toEqual({
      streamUrl: insecureWs("localhost:3212"),
      engineUrl: insecureWs("engine.example:49234"),
    });
  });

  it("uses AGENTMEMORY_URL host fallback when engine URL is absent", () => {
    expect(
      buildReadyWebSocketUrls({
        restPort: 3211,
        env: { AGENTMEMORY_URL: "https://memory.example:8443" },
      }),
    ).toEqual({
      streamUrl: insecureWs("memory.example:3212"),
      engineUrl: insecureWs("memory.example:49134"),
    });
  });

  it("preserves explicit stream and engine port overrides", () => {
    expect(
      buildReadyWebSocketUrls({
        restPort: 3111,
        env: {
          III_ENGINE_URL: secureWs("engine.example:49134"),
          III_ENGINE_PORT: "5000",
          III_STREAM_PORT: "5001",
          III_STREAMS_PORT: "5002",
        },
      }),
    ).toEqual({
      streamUrl: insecureWs("localhost:5001"),
      engineUrl: secureWs("engine.example:5000"),
    });
  });
});
