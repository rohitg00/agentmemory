import { appendFileSync } from "node:fs";

function observedBody(body) {
  if (typeof body !== "string") return body ?? null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

globalThis.fetch = async (url, init = {}) => {
  appendFileSync(
    process.env.AGENTMEMORY_HOOK_TEST_REQUESTS,
    `${JSON.stringify({
      url: String(url),
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers)),
      body: observedBody(init.body),
    })}\n`,
  );

  const mode = process.env.AGENTMEMORY_HOOK_TEST_FETCH;
  if (mode === "unreachable") throw new TypeError("fetch failed");
  if (mode === "hanging") {
    return new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("unaborted fetch")), 10_000);
      const abort = () => {
        clearTimeout(timer);
        reject(init.signal.reason);
      };
      if (init.signal.aborted) abort();
      else init.signal.addEventListener("abort", abort, { once: true });
    });
  }

  return new Response(JSON.stringify({ context: "source-hook recalled context" }), {
    status: String(url).endsWith("/observe") ? 201 : 200,
    headers: { "content-type": "application/json" },
  });
};
