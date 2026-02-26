import type { HookPayload } from "../types.js";

const MAX_QUEUE_SIZE = 500;

export class ObservationQueue {
  private queue: HookPayload[] = [];

  enqueue(payload: HookPayload): boolean {
    if (this.queue.length >= MAX_QUEUE_SIZE) return false;
    this.queue.push(payload);
    return true;
  }

  drain(): HookPayload[] {
    const items = this.queue.splice(0);
    return items;
  }

  get size(): number {
    return this.queue.length;
  }
}
