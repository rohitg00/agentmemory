import type { Writable } from "node:stream";

export interface LiveEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface LiveEventsStats {
  subscribers: number;
  eventsSent: number;
  dropped: number;
  lastEventAt: number | null;
}

export interface LiveEventWriter extends Writable {
  writableLength: number;
}

const MAX_SUBSCRIBERS = 32;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const HEARTBEAT_MS = 15_000;
const eventListeners = new Set<(event: LiveEvent) => void>();

export function formatSseFrame(event: LiveEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export class LiveEventsHub {
  private readonly writers = new Set<LiveEventWriter>();
  private readonly detach = new Map<LiveEventWriter, () => void>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private eventsSent = 0;
  private dropped = 0;
  private lastEventAt: number | null = null;

  subscribe(writer: LiveEventWriter): () => void {
    if (this.writers.size >= MAX_SUBSCRIBERS) {
      const oldest = this.writers.values().next().value as LiveEventWriter | undefined;
      if (oldest) this.remove(oldest, true);
    }
    this.writers.add(writer);
    const onClose = () => this.remove(writer, false);
    this.detach.set(writer, onClose);
    writer.once("close", onClose);
    writer.once("error", onClose);
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);
      this.heartbeat.unref();
    }
    return () => this.remove(writer, false);
  }

  emit(event: LiveEvent): void {
    this.lastEventAt = Date.now();
    for (const listener of eventListeners) {
      try { listener(event); } catch { /* observers must not break event delivery */ }
    }
    const frame = formatSseFrame(event);
    for (const writer of this.writers) {
      if (writer.destroyed || writer.writableLength > MAX_BUFFERED_BYTES) {
        this.remove(writer, true);
        continue;
      }
      try {
        writer.write(frame);
        this.eventsSent++;
      } catch {
        this.remove(writer, true);
      }
    }
  }

  stats(): LiveEventsStats {
    return {
      subscribers: this.writers.size,
      eventsSent: this.eventsSent,
      dropped: this.dropped,
      lastEventAt: this.lastEventAt,
    };
  }

  private ping(): void {
    for (const writer of this.writers) {
      if (writer.destroyed || writer.writableLength > MAX_BUFFERED_BYTES) {
        this.remove(writer, true);
        continue;
      }
      try {
        writer.write(": ping\n\n");
      } catch {
        this.remove(writer, true);
      }
    }
  }

  private remove(writer: LiveEventWriter, dropped: boolean): void {
    if (!this.writers.delete(writer)) return;
    const onClose = this.detach.get(writer);
    this.detach.delete(writer);
    if (onClose) {
      writer.off("close", onClose);
      writer.off("error", onClose);
    }
    if (dropped) {
      this.dropped++;
      if (!writer.destroyed) writer.destroy();
    }
    if (this.writers.size === 0 && this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

}

export const liveEvents = new LiveEventsHub();
export function emitLiveEvent(event: LiveEvent): void {
  liveEvents.emit(event);
}
export function onLiveEvent(listener: (event: LiveEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}
export function getLiveEventsStats(): LiveEventsStats {
  return liveEvents.stats();
}
