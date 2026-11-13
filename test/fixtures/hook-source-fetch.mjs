import { appendFileSync } from "node:fs";

globalThis.fetch = async (url, init = {}) => {
  appendFileSync(
    process.env.AGENTMEMORY_HOOK_TEST_REQUESTS,
    `${JSON.stringify({
      url: String(url),
      method: init.method,
      headers: Object.fromEntries(new Headers(init.headers)),
      body: JSON.parse(init.body),
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
