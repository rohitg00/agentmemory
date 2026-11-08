export function createRecordingProxy({ backendUrl, record, timeoutMs = 10000 }) {
  return (req, res) => {
    const path = (req.url || "/").split(/[?#]/, 1)[0];
    const aborted = new AbortController();
    const abort = () => aborted.abort();
    req.once("aborted", abort);
    res.once("error", abort);
    res.once("close", () => { if (!res.writableEnded) abort(); });
    const send = (status, text) => {
      if (res.destroyed || res.writableEnded) return;
      try {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(text);
      } catch { res.destroy(); }
    };
    const finish = async (item, text) => {
      try { await record(item); }
      catch { send(500, JSON.stringify({ error: "record_failed" })); return; }
      send(item.status, text);
    };
    const forward = async () => {
      let body = null;
      let stage = "request_read";
      let upstreamStatus;
      let timeout;
      try {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        stage = "request_parse";
        body = raw ? JSON.parse(raw) : null;
        stage = "upstream_fetch";
        timeout = AbortSignal.timeout(timeoutMs);
        const response = await fetch(backendUrl + req.url, {
          method: req.method,
          headers: { "content-type": "application/json", ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) },
          ...(raw ? { body: raw } : {}),
          signal: AbortSignal.any([aborted.signal, timeout]),
          redirect: "error",
        });
        upstreamStatus = response.status;
        stage = "upstream_read";
        const text = await response.text();
        stage = "upstream_parse";
        const noBody = req.method === "HEAD" || [204, 205, 304].includes(response.status);
        const parsed = noBody ? null : JSON.parse(text);
        await finish({ path, body, status: response.status, response: parsed }, text);
      } catch {
        let status = 502;
        let code = "upstream_unavailable";
        if (aborted.signal.aborted || req.aborted) { status = 499; code = "request_aborted"; }
        else if (stage === "request_read") { status = 400; code = "request_read_failed"; }
        else if (stage === "request_parse") { status = 400; code = "request_invalid_json"; }
        else if (timeout?.aborted) { status = 504; code = "upstream_timeout"; }
        else if (stage === "upstream_read") code = "upstream_read_failed";
        else if (stage === "upstream_parse") code = "upstream_invalid_json";
        const response = { error: code };
        await finish({ path, body, status, response, diagnostic: { code, ...(upstreamStatus === undefined ? {} : { upstreamStatus }) } }, JSON.stringify(response));
      }
    };
    void forward().catch(() => send(500, JSON.stringify({ error: "proxy_failed" })));
  };
}
