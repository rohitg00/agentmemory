import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";

const SESSION_ID = `test_${Date.now()}`;
const PROJECT = "/tmp/test-project";

function url(path: string): string {
  return `${BASE_URL}${path}`;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (SECRET) {
    headers["Authorization"] = `Bearer ${SECRET}`;
  }
  return headers;
}

async function json(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

describe("agentmemory integration", () => {
  beforeAll(async () => {
    const res = await fetch(url("/agentmemory/health")).catch(() => null);
    if (!res || !res.ok) {
      throw new Error(
        `agentmemory is not running at ${BASE_URL}. Start it with: docker compose up -d && npm start`,
      );
    }
  });

  describe("health", () => {
    it("returns ok", async () => {
      const res = await fetch(url("/agentmemory/health"));
      expect(res.status).toBe(200);
      const body = (await json(res)) as { status: string; service: string };
      expect(body.status).toBe("ok");
      expect(body.service).toBe("agentmemory");
    });
  });

  describe("session lifecycle", () => {
    it("starts a session", async () => {
      const res = await fetch(url("/agentmemory/session/start"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sessionId: SESSION_ID,
          project: PROJECT,
          cwd: PROJECT,
        }),
      });
      expect(res.status).toBe(200);
      const body = (await json(res)) as {
        session: { id: string; status: string };
        context: string;
      };
      expect(body.session.id).toBe(SESSION_ID);
      expect(body.session.status).toBe("active");
      expect(typeof body.context).toBe("string");
    });

    it("lists sessions including the new one", async () => {
      const res = await fetch(url("/agentmemory/sessions"));
      expect(res.status).toBe(200);
      const body = (await json(res)) as {
        sessions: Array<{ id: string }>;
      };
      expect(Array.isArray(body.sessions)).toBe(true);
      const found = body.sessions.find((s) => s.id === SESSION_ID);
      expect(found).toBeDefined();
    });

    it("ends the session", async () => {
      const res = await fetch(url("/agentmemory/session/end"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionId: SESSION_ID }),
      });
      expect(res.status).toBe(200);
      const body = (await json(res)) as { success: boolean };
      expect(body.success).toBe(true);
    });

    it("session is marked completed", async () => {
      const res = await fetch(url("/agentmemory/sessions"));
      const body = (await json(res)) as {
        sessions: Array<{ id: string; status: string; endedAt?: string }>;
      };
      const session = body.sessions.find((s) => s.id === SESSION_ID);
      expect(session).toBeDefined();
      expect(session!.status).toBe("completed");
      expect(session!.endedAt).toBeDefined();
    });
  });

  describe("observations", () => {
    const OBS_SESSION = `test_obs_${Date.now()}`;

    beforeAll(async () => {
      await fetch(url("/agentmemory/session/start"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sessionId: OBS_SESSION,
          project: PROJECT,
          cwd: PROJECT,
        }),
      });
    });

    afterAll(async () => {
      await fetch(url("/agentmemory/session/end"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionId: OBS_SESSION }),
      });
    });

    it("captures an observation", async () => {
      const res = await fetch(url("/agentmemory/observe"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          hookType: "post_tool_use",
          sessionId: OBS_SESSION,
          project: PROJECT,
          cwd: PROJECT,
          timestamp: new Date().toISOString(),
          data: {
            tool: "Edit",
            file: "src/auth.ts",
            content: "Added JWT token validation middleware",
          },
        }),
      });
      expect(res.status).toBe(201);
    });

    it("captures a second observation", async () => {
      const res = await fetch(url("/agentmemory/observe"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          hookType: "post_tool_use",
          sessionId: OBS_SESSION,
          project: PROJECT,
          cwd: PROJECT,
          timestamp: new Date().toISOString(),
          data: {
            tool: "Bash",
            command: "npm test",
            output: "Tests: 12 passed, 0 failed",
          },
        }),
      });
      expect(res.status).toBe(201);
    });

    it("lists observations for the session", async () => {
      const res = await fetch(
        url(`/agentmemory/observations?sessionId=${OBS_SESSION}`),
      );
      expect(res.status).toBe(200);
      const body = (await json(res)) as {
        observations: Array<{ id: string; sessionId: string }>;
      };
      expect(Array.isArray(body.observations)).toBe(true);
    });

    it("returns 400 without sessionId", async () => {
      const res = await fetch(url("/agentmemory/observations"));
      expect(res.status).toBe(400);
      const body = (await json(res)) as { error: string };
      expect(body.error).toBe("sessionId required");
    });
  });

  describe("search", () => {
    it("searches observations", async () => {
      const res = await fetch(url("/agentmemory/search"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ query: "auth", limit: 5 }),
      });
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body).toBeDefined();
    });

    it("returns results for empty limit", async () => {
      const res = await fetch(url("/agentmemory/search"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ query: "test" }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe("context", () => {
    it("generates context for a project", async () => {
      const res = await fetch(url("/agentmemory/context"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sessionId: "ctx-test",
          project: PROJECT,
        }),
      });
      expect(res.status).toBe(200);
      const body = (await json(res)) as { context: string };
      expect(typeof body.context).toBe("string");
    });
  });

  describe("viewer", () => {
    it("serves the viewer HTML", async () => {
      const res = await fetch(url("/agentmemory/viewer"));
      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type");
      expect(contentType).toContain("text/html");
      const csp = res.headers.get("content-security-policy");
      expect(csp).toContain("default-src");
      const body = await res.text();
      expect(body).toContain("<html");
    });
  });

  describe("auth", () => {
    it("health endpoint is always public", async () => {
      const res = await fetch(url("/agentmemory/health"));
      expect(res.status).toBe(200);
    });

    if (SECRET) {
      it("rejects unauthenticated requests", async () => {
        const res = await fetch(url("/agentmemory/search"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "test" }),
        });
        expect(res.status).toBe(401);
      });

      it("rejects wrong bearer token", async () => {
        const res = await fetch(url("/agentmemory/search"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer wrong-token",
          },
          body: JSON.stringify({ query: "test" }),
        });
        expect(res.status).toBe(401);
      });
    }
  });
});
