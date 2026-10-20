import type { IIIClient } from "iii-sdk";
import type { HttpRequest } from "@iii-dev/helpers/http";
import { checkAuth } from "./api.js";
import { parseCompressionScope } from "../functions/compression-recovery.js";

export function registerCompressionApi(sdk: IIIClient, secret?: string): void {
  const handler = (retry: boolean) => async (req: HttpRequest) => {
    const method = retry ? "POST" : "GET";
    const rejected = checkAuth(req, secret);
    if (rejected) return rejected;
    if (req.method && req.method.toUpperCase() !== method) return { status_code: 405, body: { error: "method_not_allowed" } };
    let scope;
    try { scope = parseCompressionScope(retry ? req.body : req.query_params ?? {}); }
    catch (error) { return { status_code: 400, body: { error: error instanceof Error ? error.message : "invalid_scope" } }; }
    try {
      const result = await sdk.trigger({ function_id: retry ? "mem::compression-retry" : "mem::compression-status", payload: scope });
      const response = result as { success?: boolean; oversized?: boolean };
      if (response?.success === false && response?.oversized === true) return { status_code: 413, body: result };
      return { status_code: 200, body: result };
    } catch { return { status_code: 503, body: { error: "compression_recovery_unavailable" } }; }
  };
  sdk.registerFunction("api::compression-status", handler(false));
  sdk.registerFunction("api::compression-retry", handler(true));
}
