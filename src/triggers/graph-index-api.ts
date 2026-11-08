import type { IIIClient } from "iii-sdk";
import type { HttpRequest } from "@iii-dev/helpers/http";

type Response = { status_code: number; headers?: Record<string, string>; body: unknown };

export function registerGraphIndexApi(
  sdk: IIIClient,
  secret: string | undefined,
  checkAuth: (req: HttpRequest, secret: string | undefined) => Response | null,
): void {
  sdk.registerFunction("api::graph-index-status", async (req: HttpRequest): Promise<Response> => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    try {
      const result = await sdk.trigger({ function_id: "mem::graph-index-status", payload: {} });
      return { status_code: 200, headers: { "Cache-Control": "no-store" }, body: result };
    } catch {
      return { status_code: 503, body: { error: "Graph index status is unavailable" } };
    }
  });
  const mutate = (command: "migrate" | "resume") => async (req: HttpRequest<Record<string, unknown>>): Promise<Response> => {
      const denied = checkAuth(req, secret);
      if (denied) return denied;
      const body = req.body ?? {};
      if (!body || typeof body !== "object" || Array.isArray(body) ||
        (body.allowLegacyScan !== undefined && typeof body.allowLegacyScan !== "boolean")) {
        return { status_code: 400, body: { error: "allowLegacyScan must be a boolean" } };
      }
      try {
        const result = await sdk.trigger<unknown, { success?: boolean; code?: string; state?: string }>({
          function_id: `mem::graph-index-${command}`,
          payload: { allowLegacyScan: body.allowLegacyScan === true },
        });
        const status = result.success === false
          ? result.code === "storage-unavailable" ? 503 : result.code === "invalid-state" || result.code === "no-job" ? 409 : 400
          : result.state === "ready" ? 200 : 202;
        return { status_code: status, headers: { "Cache-Control": "no-store" }, body: result };
      } catch {
        return { status_code: 503, body: { error: "Graph index migration could not be started" } };
      }
  };
  sdk.registerFunction("api::graph-index-migrate", mutate("migrate"));
  sdk.registerFunction("api::graph-index-resume", mutate("resume"));
}
