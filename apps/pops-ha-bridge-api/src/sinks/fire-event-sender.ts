/**
 * PRD-237 US-02: outbound `fire_event` sender.
 *
 * Owns the bounded reconnect queue and the per-frame WS write logic.
 * The HA WebSocket subscriber composes this — when the socket is up,
 * `send` writes immediately; while reconnecting, frames are queued and
 * `flush` drains them in FIFO order on the next successful handshake.
 *
 * Kept separate from the subscriber so the subscriber file stays
 * focused on the inbound state machine (per the per-file LOC ceiling)
 * and so the queue + frame-serialisation logic can be unit-tested in
 * isolation.
 */
import { FireEventQueue, type FireEventFrame } from './fire-event-queue.js';

import type { SubscriberLogger } from '../ws-subscriber-types.js';

export type SendFireEventOutcome = 'sent' | 'queued';

export interface FireEventSenderDeps {
  readonly nextCommandId: () => number;
  readonly write: (frameJson: string) => boolean;
  readonly logger: SubscriberLogger;
  readonly now: () => number;
  readonly queueCap?: number;
}

export interface LiveSocketHandle {
  readonly isReady: () => boolean;
  readonly send: (data: string) => void;
}

export class FireEventSender {
  private readonly queue: FireEventQueue;
  private readonly nextCommandId: () => number;
  private readonly write: (frameJson: string) => boolean;

  constructor(deps: FireEventSenderDeps) {
    this.nextCommandId = deps.nextCommandId;
    this.write = deps.write;
    const logger = deps.logger;
    this.queue = new FireEventQueue({
      cap: deps.queueCap,
      now: deps.now,
      onDropped: (event) => {
        logger.warn('ha sink frame dropped (queue at cap)', {
          eventType: event.eventType,
          queueDepth: event.queueDepth,
          droppedAt: event.droppedAt,
        });
      },
    });
  }

  send(
    eventType: string,
    haEventName: string,
    eventData: Record<string, unknown>
  ): SendFireEventOutcome {
    const frame: FireEventFrame = { eventType, haEventName, eventData };
    const ok = this.write(this.serialise(frame));
    if (ok) return 'sent';
    this.queue.enqueue(frame);
    return 'queued';
  }

  flush(): void {
    if (this.queue.size() === 0) return;
    this.queue.drain((frame) => {
      this.write(this.serialise(frame));
    });
  }

  size(): number {
    return this.queue.size();
  }

  droppedTotal(eventType: string): number {
    return this.queue.droppedTotal(eventType);
  }

  private serialise(frame: FireEventFrame): string {
    return JSON.stringify({
      id: this.nextCommandId(),
      type: 'fire_event',
      event_type: frame.haEventName,
      event_data: frame.eventData,
    });
  }
}

export function createFireEventSenderForSubscriber(args: {
  readonly liveSocket: LiveSocketHandle;
  readonly nextCommandId: () => number;
  readonly logger: SubscriberLogger;
  readonly now: () => number;
  readonly queueCap?: number;
}): FireEventSender {
  return new FireEventSender({
    nextCommandId: args.nextCommandId,
    write: (frameJson) => {
      if (!args.liveSocket.isReady()) return false;
      args.liveSocket.send(frameJson);
      return true;
    },
    logger: args.logger,
    now: args.now,
    queueCap: args.queueCap,
  });
}
