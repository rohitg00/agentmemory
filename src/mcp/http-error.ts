const MAX_UPSTREAM_ERROR_DETAIL = 512;

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function structuredDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return compact(body);
    }
    const record = parsed as Record<string, unknown>;
    const fields = ["code", "error", "message", "reason"].flatMap((key) => {
      const value = record[key];
      return typeof value === "string" || typeof value === "number"
        ? [`${key}=${String(value)}`]
        : [];
    });
    return fields.length > 0 ? fields.join(" ") : compact(body);
  } catch {
    return compact(body);
  }
}

/**
 * Preserve bounded, operator-useful upstream diagnostics without reflecting
 * headers, tokens, or an unbounded response body into MCP errors.
 */
export async function upstreamHttpError(
  method: string,
  path: string,
  response: Response,
): Promise<Error> {
  let detail = "";
  try {
    detail = structuredDetail(await response.text()).slice(
      0,
      MAX_UPSTREAM_ERROR_DETAIL,
    );
  } catch {
    // A missing/unreadable response body must not hide the HTTP status.
  }
  const suffix = detail ? `; ${detail}` : "";
  return new Error(
    `${method} ${path} -> ${response.status} ${response.statusText}${suffix}`,
  );
}
