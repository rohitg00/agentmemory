import { checkPayloadFrameSize } from "./frame-guard.js";

export function insightHttpResponse(result: unknown, mcp = false): { status_code: number; body: unknown } {
  const flags = result as { invalid?: boolean; oversized?: boolean; success?: boolean } | null;
  let status = 200;
  if (flags?.invalid) status = 400;
  if (flags?.oversized) status = 413;

  function response(body: unknown, status_code: number) {
    if (!mcp) return { status_code, body };
    return {
      status_code,
      body: {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
        ...(status_code !== 200 || flags?.success === false ? { isError: true } : {}),
      },
    };
  }

  const envelope = response(result, status);
  const oversized = checkPayloadFrameSize(envelope, "reduce limit or filter by project");
  return oversized ? response(oversized, 413) : envelope;
}
