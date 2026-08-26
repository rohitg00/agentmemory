import { ImageResponse } from "next/og";
import { getProjectMeta } from "@/lib/meta";

export const alt = "agentmemory: persistent memory for AI coding agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const meta = getProjectMeta();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#0a0a0a",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 18,
            letterSpacing: 3,
            fontWeight: 400,
            color: "#7d8187",
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 12,
              background: "#ff7a17",
            }}
          />
          <span>AGENTMEMORY</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              fontSize: 124,
              fontWeight: 400,
              lineHeight: 1,
              letterSpacing: -4,
              color: "#ffffff",
            }}
          >
            <span>agent</span>
            <span style={{ color: "#dadbdf" }}>memory</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#dadbdf",
              letterSpacing: 0,
              maxWidth: 900,
              lineHeight: 1.4,
              fontWeight: 400,
            }}
          >
            Persistent memory for AI coding agents. Runs locally. Zero external
            databases.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 48,
            fontSize: 20,
            color: "#7d8187",
            letterSpacing: 2,
            textTransform: "uppercase",
            fontWeight: 400,
            borderTop: "1px solid #212327",
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "#ffffff" }}>{meta.mcpTools}</span>
            <span>MCP TOOLS</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "#ffffff" }}>{meta.restEndpoints}</span>
            <span>REST ENDPOINTS</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "#ffffff" }}>0</span>
            <span>EXTERNAL DBs</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
