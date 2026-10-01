import type { IIIClient } from "iii-sdk";
import { STREAM } from "../state/schema.js";

export type StreamRelayState = "ok" | "down" | "unknown";

export interface StreamRelayProbe {
  check(): Promise<StreamRelayState>;
  close(): void;
}

interface ProbeSocket {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export interface StreamRelayProbeOptions {
  url: string;
  timeoutMs?: number;
  createSocket?: (url: string) => ProbeSocket;
}

const PROBE_GROUP = "relay-probe";
const PROBE_EVENT = "relay.probe";
const OPEN = 1;

function defaultSocket(url: string): ProbeSocket {
  return new WebSocket(url) as unknown as ProbeSocket;
}

export function createStreamRelayProbe(
  sdk: IIIClient,
  options: StreamRelayProbeOptions,
): StreamRelayProbe {
  const timeoutMs = options.timeoutMs ?? 5000;
  const createSocket = options.createSocket ?? defaultSocket;
  let socket: ProbeSocket | null = null;
  let ready: Promise<boolean> | null = null;
  const waiters = new Map<string, () => void>();

  function connect(): Promise<boolean> {
    if (socket && socket.readyState === OPEN && ready) return ready;
    try {
      socket?.close();
    } catch {}
    let current: ProbeSocket;
    try {
      current = createSocket(options.url);
    } catch {
      socket = null;
      ready = null;
      return Promise.resolve(false);
    }
    socket = current;
    ready = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      current.onopen = () => {
        clearTimeout(timer);
        current.send(
          JSON.stringify({
            type: "join",
            data: {
              subscriptionId: `relay-probe-${process.pid}-${Date.now()}`,
              streamName: STREAM.name,
              groupId: PROBE_GROUP,
            },
          }),
        );
        resolve(true);
      };
      current.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      current.onclose = () => {
        clearTimeout(timer);
        if (socket === current) {
          socket = null;
          ready = null;
        }
        resolve(false);
      };
    });
    current.onmessage = (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : String(event.data);
        const nonce = JSON.parse(raw)?.event?.event?.data?.nonce;
        if (typeof nonce === "string") waiters.get(nonce)?.();
      } catch {}
    };
    return ready;
  }

  async function check(): Promise<StreamRelayState> {
    if (!(await connect())) return "unknown";
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const received = new Promise<boolean>((resolve) => {
      waiters.set(nonce, () => resolve(true));
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    try {
      await sdk.trigger({
        function_id: "stream::send",
        payload: {
          stream_name: STREAM.name,
          group_id: PROBE_GROUP,
          id: nonce,
          type: PROBE_EVENT,
          data: { nonce },
        },
        timeoutMs,
      });
    } catch {
      waiters.delete(nonce);
      clearTimeout(timer);
      return "down";
    }
    const ok = await received;
    waiters.delete(nonce);
    clearTimeout(timer);
    return ok ? "ok" : "down";
  }

  return {
    check,
    close() {
      waiters.clear();
      try {
        socket?.close();
      } catch {}
      socket = null;
      ready = null;
    },
  };
}
