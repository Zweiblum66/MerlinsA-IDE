import { EventEmitter } from "node:events";

type EventCallback = (event: string, data: unknown) => void;

/**
 * SSE event bus for pushing real-time updates to connected clients.
 * Wraps Node's EventEmitter with a typed subscribe/emit interface.
 */
export class SseEventBus {
  private readonly _emitter: EventEmitter;
  private static readonly _CHANNEL = "sse";

  constructor() {
    this._emitter = new EventEmitter();
    this._emitter.setMaxListeners(200);
  }

  /**
   * Emits an event with associated data to all subscribers.
   */
  emit(event: string, data: unknown): void {
    this._emitter.emit(SseEventBus._CHANNEL, event, data);
  }

  /**
   * Subscribes to all events on the bus.
   * Returns an unsubscribe function.
   */
  subscribe(callback: EventCallback): () => void {
    this._emitter.on(SseEventBus._CHANNEL, callback);
    return () => {
      this._emitter.off(SseEventBus._CHANNEL, callback);
    };
  }
}
