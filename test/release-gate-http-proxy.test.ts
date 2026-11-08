import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";

interface Receipt {
  path: string;
  body: unknown;
  status: number;
  response: unknown;
  diagnostic?: { code: string; upstreamStatus?: number };
}
const children: ChildProcess[] = [];
afterEach(async () => {
  await Promise.all(children.splice(0).map((child) => new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once("close", () => resolve());
    child.kill("SIGKILL");
  })));
});

async function fixture(slowTimeoutMs = 2000) {
  const helper = new URL("../scripts/release-gate/http-proxy.mjs", import.meta.url).href;
  const script = `
    import http from 'node:http';
    import {createRecordingProxy} from ${JSON.stringify(helper)};
    const backend=http.createServer((req,res)=>{
      req.on('error',()=>{});
      process.send({type:'upstream',path:req.url});
      if(req.url==='/empty'){res.writeHead(204);res.end();return;}
      if(req.url==='/html'){res.writeHead(502);res.end('<html>Bearer synthetic-sensitive-body</html>');return;}
      if(req.url==='/invalid'){res.writeHead(200);res.end('{');return;}
      if(req.url==='/empty-ok'){res.writeHead(200);res.end();return;}
      if(req.url==='/reset'){res.writeHead(200,{'content-type':'application/json','content-length':'100'});res.write('{');setTimeout(()=>res.destroy(),10);return;}
      if(req.url==='/disconnect'){req.socket.destroy();return;}
      if(req.url==='/slow')return;
      let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
        const status=req.url==='/denied'?401:201;
        res.writeHead(status,{'content-type':'application/json'});
        res.end(JSON.stringify({ok:status===201,body:raw?JSON.parse(raw):null,authForwarded:req.headers.authorization==='Bearer synthetic-proxy-token'}));
      });
    });
    backend.listen(0,'127.0.0.1',()=>{
      const options={backendUrl:'http://127.0.0.1:'+backend.address().port,timeoutMs:2000,record:item=>{
        if(item.path==='/record-error')throw new Error('synthetic-sensitive-record-error');
        if(item.path==='/record-rejection')return Promise.reject(new Error('synthetic-sensitive-record-error'));
        process.send({type:'record',item});
      }};
      const forward=createRecordingProxy(options);
      const forwardSlow=createRecordingProxy({...options,timeoutMs:${slowTimeoutMs}});
      const proxy=http.createServer((req,res)=>(req.url==='/slow'?forwardSlow:forward)(req,res));
      proxy.listen(0,'127.0.0.1',()=>process.send({type:'ready',port:proxy.address().port}));
    });
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  children.push(child);
  const records: Receipt[] = [];
  const upstream: string[] = [];
  let stderr = "";
  child.stderr?.on("data", (chunk) => { stderr += chunk; });
  const port = await new Promise<number>((resolve, reject) => {
    child.on("message", (message: { type: string; port?: number; item?: Receipt; path?: string }) => {
      if (message.type === "ready") resolve(message.port!);
      if (message.type === "record") records.push(message.item!);
      if (message.type === "upstream") upstream.push(message.path!);
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`Proxy exited ${code}: ${stderr}`)));
  });
  const url = `http://127.0.0.1:${port}`;
  const post = (path: string, body = '{"synthetic":"payload"}') => fetch(url + path, {
    method: "POST", body, headers: { authorization: "Bearer synthetic-proxy-token", "content-type": "application/json" }, signal: AbortSignal.timeout(3000),
  });
  const stillUsable = async () => { expect((await post("/success")).status).toBe(201); expect(child.exitCode).toBeNull(); };
  return { port, post, records, upstream, stillUsable, stderr: () => stderr };
}

describe("release gate recording HTTP proxy", () => {
  it("forwards JSON, status and bearer auth while recording no headers", async () => {
    const server = await fixture();
    const response = await server.post("/success");
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, body: { synthetic: "payload" }, authForwarded: true });
    await vi.waitFor(() => expect(server.records).toHaveLength(1));
    expect(server.records[0]).toMatchObject({ path: "/success", body: { synthetic: "payload" }, status: 201 });
    expect(JSON.stringify(server.records)).not.toContain("synthetic-proxy-token");
  });

  it("forwards an empty 204 response without trying to parse JSON", async () => {
    const server = await fixture();
    const response = await server.post("/empty");
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    await vi.waitFor(() => expect(server.records[0]).toMatchObject({ status: 204, response: null }));
    await server.stillUsable();
  });

  it.each(["/html", "/invalid", "/empty-ok"])("contains invalid upstream response %s without logging raw content", async (path) => {
    const server = await fixture();
    const response = await server.post(path);
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text.length).toBeLessThan(200);
    expect(JSON.parse(text)).toHaveProperty("error");
    await vi.waitFor(() => expect(server.records[0]?.diagnostic).toMatchObject({ code: "upstream_invalid_json" }));
    expect(JSON.stringify(server.records)).not.toContain("synthetic-sensitive-body");
    expect(server.stderr()).not.toContain("synthetic-sensitive-body");
    await server.stillUsable();
  });

  it("rejects malformed request JSON before forwarding or recording its raw body", async () => {
    const server = await fixture();
    const response = await server.post("/success?token=synthetic-query-secret", '{"token":"synthetic-sensitive-request"');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "request_invalid_json" });
    await vi.waitFor(() => expect(server.records[0]).toMatchObject({ path: "/success", body: null, diagnostic: { code: "request_invalid_json" } }));
    expect(JSON.stringify(server.records)).not.toMatch(/synthetic-sensitive-request|synthetic-query-secret|synthetic-proxy-token/);
    expect(server.upstream).toEqual([]);
    await server.stillUsable();
  });

  it("preserves a valid JSON error response and status", async () => {
    const server = await fixture();
    const response = await server.post("/denied");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false });
    await server.stillUsable();
  });

  it.each([["/disconnect", 502], ["/reset", 502], ["/slow", 504]])("contains interrupted or timed out upstream %s", async (path, status) => {
    const server = await fixture(path === "/slow" ? 150 : 2000);
    const response = await server.post(String(path));
    expect(response.status).toBe(status);
    expect(await response.json()).toHaveProperty("error");
    await vi.waitFor(() => expect(server.records[0]?.diagnostic).toBeDefined());
    await server.stillUsable();
  });

  it("survives a client abort while reading an incomplete request", async () => {
    const server = await fixture();
    const socket = net.createConnection({ host: "127.0.0.1", port: server.port });
    await new Promise<void>((resolve) => socket.once("connect", resolve));
    socket.write("POST /success HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\n{");
    await new Promise((resolve) => setTimeout(resolve, 20));
    socket.destroy();
    await vi.waitFor(() => expect(server.records[0]?.diagnostic).toMatchObject({ code: "request_aborted" }));
    await server.stillUsable();
  });

  it("cancels an upstream request when the client disconnects after sending its body", async () => {
    const server = await fixture();
    const socket = net.createConnection({ host: "127.0.0.1", port: server.port });
    await new Promise<void>((resolve) => socket.once("connect", resolve));
    socket.write("POST /slow HTTP/1.1\r\nHost: localhost\r\nContent-Length: 2\r\n\r\n{}");
    await vi.waitFor(() => expect(server.upstream).toContain("/slow"));
    socket.destroy();
    await vi.waitFor(() => expect(server.records[0]?.diagnostic).toMatchObject({ code: "request_aborted" }));
    await server.stillUsable();
  });

  it.each(["/record-error", "/record-rejection"])("contains diagnostic-writer failure %s instead of rejecting the server callback", async (path) => {
    const server = await fixture();
    const response = await server.post(path);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "record_failed" });
    expect(server.stderr()).not.toContain("synthetic-sensitive-record-error");
    await server.stillUsable();
  });
});
