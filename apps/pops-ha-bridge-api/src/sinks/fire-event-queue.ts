/**
 * PRD-237 US-02 / PRD-229 US-05: bounded FIFO queue for outbound HA frames.
 *
 * Originally introduced for `fire_event` frames. Now carries any HA
 * WebSocket command body (sans `id`) so the same queue can hold
 * `fire_event` and `call_service` frames produced by sink mappings.
 *
 * When the HA WebSocket is reconnecting we cannot deliver immediately,
 * but per the PRD we still accept the sink invocation and respond 200
 * to the orchestrator. The frame is enqueued here and flushed in FIFO
 * order on the next successful auth + subscribe handshake.
 *
 * The queue is bounded (default 100, configurable via
 * `HA_SINK_QUEUE_CAP`) — at-cap pushes drop the oldest entry,
 * increment the `ha_sink_dropped_total{event_type}` counter, and emit
 * a structured warning. Bounded so a sustained HA outage cannot exhaust
 * memory; small enough to fail loud rather than absorb runaway
 * publishing.
 */
export interface QueuedHaFrame {
  readonly eventType: string;
  readonly body: Record<string, unknown>;
}

export type FireEventFrame = QueuedHaFrame;

export interface DroppedFrameEvent {
  readonly eventType: string;
  readonly queueDepth: number;
  readonly droppedAt: number;
}

export interface FireEventQueueOptions {
  readonly cap?: number;
  readonly now?: () => number;
  readonly onDropped?: (event: DroppedFrameEvent) => void;
}

const DEFAULT_CAP = 100;

export class FireEventQueue {
  private readonly cap: number;
  private readonly buffer: QueuedHaFrame[] = [];
  private readonly droppedByEventType = new Map<string, number>();
  private readonly now: () => number;
  private readonly onDropped: (event: DroppedFrameEvent) => void;

  constructor(options: FireEventQueueOptions = {}) {
    this.cap = options.cap ?? DEFAULT_CAP;
    this.now = options.now ?? (() => Date.now());
    this.onDropped = options.onDropped ?? (() => undefined);
  }

  enqueue(frame: QueuedHaFrame): void {
    if (this.buffer.length >= this.cap) {
      const dropped = this.buffer.shift();
      if (dropped !== undefined) {
        const prev = this.droppedByEventType.get(dropped.eventType) ?? 0;
        this.droppedByEventType.set(dropped.eventType, prev + 1);
        this.onDropped({
          eventType: dropped.eventType,
          queueDepth: this.buffer.length,
          droppedAt: this.now(),
        });
      }
    }
    this.buffer.push(frame);
  }

  drain(visit: (frame: QueuedHaFrame) => void): void {
    while (this.buffer.length > 0) {
      const next = this.buffer.shift();
      if (next === undefined) return;
      visit(next);
    }
  }

  size(): number {
    return this.buffer.length;
  }

  droppedTotal(eventType: string): number {
    return this.droppedByEventType.get(eventType) ?? 0;
  }
}
